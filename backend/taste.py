"""사진첩 + 유튜브 → LLM이 직접 취향 분석 (사진 6 : 유튜브 4).

두 번 호출한다.
1) 읽기: 고른 사진을 한 번에 넣어 장소 종류·태그·동행 수를 읽는다 (detail=low → 사진 1장 약 85토큰).
2) 통합: 사진에서 읽은 것 + 유튜브 집계를 6:4 비중으로 판단해
   고정 주제 값과, 이 사람에게만 맞춘 동적 주제·옵션을 받는다.

실패하면 TasteError — 프론트는 기존 규칙 기반 analyze()로 돌아간다.
"""
import json, os
from collections import Counter

from pydantic import BaseModel, Field

from courses import COMPANIONS, PLANS, TAGS, TRAITS
from places import AREA_CENTERS, meters

MODEL = os.getenv("OPENAI_TASTE_MODEL", "gpt-5-mini")
PHOTO_LIMIT = 12  # 비용 상한 — 더 고르면 고르게 솎아서 이 장수만 본다
PHOTO_WEIGHT, YT_WEIGHT = 6, 4
N_TOPICS = 4  # 매번 새로 만드는 주제 수
AREA_MAX_M = 3000  # 이보다 멀면 동네를 특정하지 않음

# 사진에서 읽어낼 값 — 장소 종류는 기존 더미(PHOTOS.place)와 같은 어휘
PLACE_KINDS = ["식당", "카페", "바", "공원", "강변", "거리", "전시장", "실내", "기타"]
PHOTO_TAGS = [*TAGS, "음식", "운동"]
# 고정 주제 — 사용자가 바꿀 수 있지만 주제 자체는 항상 이 6개 (예산·지역은 결과 화면 조건에서 직접 고름)
FIXED = {"crowd": TRAITS["crowd"], "hour": TRAITS["hour"], "pace": TRAITS["pace"],
         "plan": {k: v[0] for k, v in PLANS.items()}, "companion": COMPANIONS}
FIXED_NAMES = {"crowd": "분위기", "hour": "시간대", "pace": "활동성", "plan": "일정", "companion": "누구랑"}


class TasteError(Exception):
    pass


class PhotoIn(BaseModel):
    ts: str | None = None  # EXIF 촬영 시각 ISO (없으면 None)
    lat: float | None = None
    lng: float | None = None
    b64: str = Field(min_length=32)  # data:image/jpeg;base64,... (프론트에서 512px로 줄인 것)


class TasteRequest(BaseModel):
    yt_id: str | None = None
    photos: list[PhotoIn] = []


def _obj(props: dict) -> dict:
    """strict json_schema는 모든 키가 required + additionalProperties false여야 한다"""
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


def _enum(values) -> dict:
    return {"type": "string", "enum": list(values)}


def _call_llm(messages: list[dict], schema: dict, name: str) -> dict:
    from openai import OpenAI, OpenAIError

    if not os.getenv("OPENAI_API_KEY"):
        raise TasteError("OPENAI_API_KEY가 설정되지 않았어요 (backend/.env)")
    effort = os.getenv("OPENAI_REASONING_EFFORT", "minimal" if MODEL.startswith(("gpt-5", "o")) else "")
    try:
        res = OpenAI().chat.completions.create(
            model=MODEL, messages=messages,
            response_format={"type": "json_schema", "json_schema": {"name": name, "strict": True, "schema": schema}},
            **({"reasoning_effort": effort} if effort else {}),
        )
    except OpenAIError as e:
        raise TasteError(f"취향 분석 LLM 호출 실패: {e}") from e
    msg = res.choices[0].message
    if getattr(msg, "refusal", None):
        raise TasteError(f"LLM이 응답을 거절했어요: {msg.refusal}")
    return json.loads(msg.content or "{}")


def pick_area(lat: float | None, lng: float | None) -> str | None:
    """EXIF 좌표 → 가장 가까운 동네 (역지오코딩 API 없이 기준점 거리로만, 무료)"""
    if lat is None or lng is None:
        return None
    area, dist = min(((k, meters((lat, lng), c)) for k, c in AREA_CENTERS.items()), key=lambda x: x[1])
    return area if dist <= AREA_MAX_M else None


def thin(photos: list[PhotoIn]) -> list[PhotoIn]:
    """PHOTO_LIMIT 장을 넘으면 앞뒤로 치우치지 않게 고르게 솎는다"""
    if len(photos) <= PHOTO_LIMIT:
        return photos
    step = len(photos) / PHOTO_LIMIT
    return [photos[int(i * step)] for i in range(PHOTO_LIMIT)]


def hour_bucket(h: int) -> str:
    return "morning" if h < 11 else "noon" if h < 16 else "sunset" if h < 19 else "night"


def exif_facts(p: PhotoIn) -> dict:
    """사진에서 LLM 없이 확실히 아는 것 (촬영 시각·동네)"""
    hour, day = None, None
    if p.ts:
        try:
            from datetime import datetime

            dt = datetime.fromisoformat(p.ts.replace("Z", "+00:00"))
            hour, day = dt.hour, "월화수목금토일"[dt.weekday()]
        except ValueError:
            pass
    return {"hour": hour, "day": day, "area": pick_area(p.lat, p.lng)}


READ_PROMPT = """너는 사진을 보고 '어떤 자리에서 찍었는지'만 읽는다. 사람 얼굴·신원은 절대 추측하지 않는다.
사진마다 장소 종류, 어울리는 태그, 함께 있는 사람 수(사진에 보이는 인원, 셀카 1명, 풍경만이면 1)를 고른다.
확신이 없으면 장소는 '기타'로 둔다. 입력 순서 그대로 i(0부터)를 붙여 전부 반환한다."""


def read_photos(photos: list[PhotoIn]) -> list[dict]:
    """1) Vision — 사진 내용 읽기. EXIF로 아는 시각·동네는 같이 알려줘서 판단을 돕는다"""
    if not photos:
        return []
    facts = [exif_facts(p) for p in photos]
    content: list[dict] = []
    for i, (p, f) in enumerate(zip(photos, facts)):
        when = f"{f['day']}요일 {f['hour']}시" if f["hour"] is not None else "촬영 시각 모름"
        content.append({"type": "text", "text": f"[{i}] {when} / 동네 {f['area'] or '모름'}"})
        content.append({"type": "image_url", "image_url": {"url": p.b64, "detail": "low"}})

    schema = _obj({"photos": {"type": "array", "items": _obj({
        "i": {"type": "integer"},
        "place": _enum(PLACE_KINDS),
        "tags": {"type": "array", "items": _enum(PHOTO_TAGS)},
        "people": {"type": "integer"},
        "note": {"type": "string"},  # 한 줄 설명 (통합 분석의 근거로 쓰임)
    })}})
    out = _call_llm([{"role": "system", "content": READ_PROMPT}, {"role": "user", "content": content}], schema, "photo_read")

    rows = []
    for r in out.get("photos", []):
        i = r.get("i", -1)
        if not 0 <= i < len(photos):
            continue
        rows.append({**r, **facts[i]})
    return rows


def photo_stats(rows: list[dict]) -> dict:
    """사진에서 세어보면 바로 나오는 것 — LLM에 맡기지 않고 서버가 계산"""
    hours = [r["hour"] for r in rows if r.get("hour") is not None]
    people = [max(1, r.get("people", 1)) for r in rows]
    return {
        "total": len(rows),
        "days": len({r["day"] for r in rows if r.get("day")}),
        "party": round(sum(people) / len(people)) if people else 2,
        "hour_counts": dict(Counter(hour_bucket(h) for h in hours)),
        "place_counts": dict(Counter(r["place"] for r in rows)),
        "tag_counts": dict(Counter(t for r in rows for t in r.get("tags", []))),
        "area_counts": dict(Counter(r["area"] for r in rows if r.get("area"))),
    }


def yt_brief(yt: dict | None) -> dict:
    """유튜브 집계에서 판단에 쓸 부분만 추린다 (토큰 절약)"""
    if not yt:
        return {}
    return {
        "likes": yt.get("likes", 0), "subs": yt.get("subs", 0),
        "categories": yt.get("categories", [])[:6],
        "channels": yt.get("channels", [])[:10],
        "sub_channels": yt.get("sub_channels", [])[:15],
        "tags": yt.get("tags", [])[:15],
        "topics": yt.get("topics", [])[:10],
        "titles": yt.get("titles", [])[:20],
    }


MERGE_PROMPT = f"""너는 사용자의 여가 취향을 읽는 분석가다. 서울 마포구에서 놀 코스를 추천하기 위한 준비 단계다.

판단 비중
- 사진첩 {PHOTO_WEIGHT} : 유튜브 {YT_WEIGHT}. 사진은 실제로 간 곳이고 유튜브는 보고 싶은 것이라, 둘이 엇갈리면 사진 쪽을 따른다.
- 사진이 없으면 유튜브만으로, 유튜브가 없으면 사진만으로 판단한다.

할 일 1 — 고정 주제 값 정하기
분위기(crowd)·시간대(hour)·활동성(pace)·일정(plan)·누구랑(companion) 다섯 가지를 각각 하나씩 고른다.
evidence에는 왜 그렇게 봤는지 데이터를 짚어 한 줄로 쓴다. 예: "사진 12장 중 7장이 저녁 7시 이후".

할 일 2 — 동적 주제 {N_TOPICS}개 만들기
이 사람의 기록에서만 나올 수 있는 주제와 선택지를 매번 새로 만든다. 일반적인 설문 문항이 아니라,
"이 사람 기록을 본 사람만 쓸 수 있는 문장"이어야 한다.
- name: 주제 이름 (12자 안팎). 예: "요즘 반복되는 저녁", "혼자 있고 싶을 때"
- opts: 선택지 3~5개. l(라벨)은 15자 안팎의 구체적인 장면. 예: "노포에서 조용히 한잔"
- 선택지마다 성격이 가까운 기본값을 붙인다 — mood(calm 힐링·휴식 / active 운동·액티비티 / new 새로운 경험 / food 미식),
  spend(meal 식사 / cafe 카페·디저트 / drink 술·바 / play 전시·체험), tag({" / ".join(TAGS)}).
  해당 없으면 null. 코스를 짤 때 이 값을 쓰니 최대한 채운다.
- 주제 하나는 여러 개 고를 수 있게(multi=true) 만들어도 된다.
- hint: 코스를 짤 LLM에게 넘길 한 줄 설명. 사용자가 이 주제에서 고른 답을 어떻게 반영해야 하는지 쓴다.
- evidence: 이 주제를 왜 물어보는지, 기록에서 찾은 근거 한 줄.
- 고정 주제({", ".join(FIXED_NAMES.values())})와 겹치는 주제는 만들지 않는다.

할 일 3 — 요약
tags에는 이 사람을 나타내는 태그를 최대 3개, highlights에는 결과 화면에 띄울 짧은 칩 2~3개
(예: "성수 로스터리 단골", "평균 2명과 함께")를 만든다.

근거 없는 평가는 쓰지 않는다. 데이터에 없는 장소명·수치를 지어내지 않는다. 모든 문장은 한국어 존댓말이 아닌 담백한 서술로."""


def merge_schema() -> dict:
    opt = _obj({
        "v": {"type": "string"},
        "l": {"type": "string"},
        "mood": {"type": ["string", "null"], "enum": [*TRAITS["mood"], None]},
        "spend": {"type": ["string", "null"], "enum": [*TRAITS["spend"], None]},
        "tag": {"type": ["string", "null"], "enum": [*TAGS, None]},
    })
    topic = _obj({
        "key": {"type": "string"},
        "name": {"type": "string"},
        "multi": {"type": "boolean"},
        "hint": {"type": "string"},
        "evidence": {"type": "string"},
        "opts": {"type": "array", "items": opt},
    })
    return _obj({
        "fixed": _obj({k: _enum(v) for k, v in FIXED.items()}),
        "evidence": _obj({k: {"type": "string"} for k in [*FIXED, "tags"]}),
        "tags": {"type": "array", "items": _enum(TAGS)},
        "highlights": {"type": "array", "items": {"type": "string"}},
        "topics": {"type": "array", "items": topic},
    })


def analyze(req: TasteRequest, yt: dict | None) -> dict:
    """사진 읽기 → 유튜브와 통합 → 프론트가 쓸 취향 결과"""
    if not req.photos and not yt:
        raise TasteError("분석할 기록이 없어요")
    rows = read_photos(thin(req.photos))
    stats = photo_stats(rows)
    user = {
        "사진에서 읽은 것": [
            {k: r[k] for k in ("hour", "day", "area", "place", "tags", "people", "note") if r.get(k) is not None}
            for r in rows
        ],
        "사진 집계": stats,
        "유튜브": yt_brief(yt),
        "선택지 라벨": {"crowd": FIXED["crowd"], "hour": FIXED["hour"], "pace": FIXED["pace"],
                    "plan": FIXED["plan"], "companion": FIXED["companion"]},
    }
    out = _call_llm(
        [{"role": "system", "content": MERGE_PROMPT},
         {"role": "user", "content": json.dumps(user, ensure_ascii=False)}],
        merge_schema(), "taste_profile",
    )

    fixed = out.get("fixed", {})
    topics = [t for t in out.get("topics", []) if t.get("opts")][:N_TOPICS]
    # 옵션 값(v)이 비거나 겹치면 프론트 선택이 꼬여서 서버가 다시 매긴다
    for ti, t in enumerate(topics):
        for oi, o in enumerate(t["opts"]):
            o["v"] = f"t{ti}o{oi}"
    return {
        "source": "llm",
        "fixed": {k: fixed.get(k) for k in FIXED},
        "evidence": out.get("evidence", {}),
        "tags": out.get("tags", [])[:3],
        "highlights": out.get("highlights", [])[:3],
        "topics": topics,
        "photo": {"total": stats["total"], "days": stats["days"], "party": stats["party"]},
        "youtube": {"likes": (yt or {}).get("likes", 0), "subs": (yt or {}).get("subs", 0)},
    }
