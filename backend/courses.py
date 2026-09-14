"""취향·조건 → LLM(GPT)이 후보 장소 안에서만 코스를 짜고, 서버가 검증해 프론트 Course 형태로 반환.

LLM은 장소를 지어내지 못하게 짧은 ref(p1, p2…)로만 고르고, 없는 ref·먼 구간·시간/예산 초과 코스는 서버가 버린다.
"""
import hashlib, json, math, os, random, re

from pydantic import BaseModel, Field

from places import AREA_CENTERS, candidates_by_area, meters

DEFAULT_MODEL = "gpt-5-mini"
N_COURSES = 3  # 응답으로 돌려줄 코스 수
N_REQUEST = 5  # GPT에 요청할 코스 수 — 서버 검증에서 일부 버려져도 3개를 채우기 위해 넉넉히
MAX_LEG_M = 2000  # 도보 한 구간 최대 (직선×1.3 추정)
COURSE_KINDS = ["식사", "카페", "한잔", "체험", "문화", "산책"]
TINTS = ["#00A46E", "#8FBF2E", "#00795A"]
TAGS = ["전시", "야경", "사진", "로컬", "기록", "자연"]
# 데이터로 확인할 수 없는 평가·혼잡도 표현 — 프롬프트로 막아도 새어 나와서 서버에서 한 번 더 거름
UNVERIFIED = re.compile(r"인기|유명|맛집|한적|붐비지|웨이팅")

# 프론트 data.ts Q 옵션과 같은 값·라벨
TRAITS = {
    "mood": {"calm": "조용히 쉬기", "active": "몸 쓰기", "new": "안 해본 것", "food": "맛있는 것"},
    "crowd": {"busy": "북적이는 곳", "mid": "적당한 곳", "quiet": "한적한 곳"},
    "hour": {"morning": "아침", "noon": "낮", "sunset": "노을 무렵", "night": "밤"},
    "spend": {"cafe": "커피·디저트", "meal": "제대로 한 끼", "drink": "술 한잔", "play": "문화·체험"},
    "pace": {"walk": "많이 걷기", "sit": "한 곳에 오래 앉기"},
}
TRAIT_NAMES = {"mood": "쉬는 방식", "crowd": "사람 많은 곳", "hour": "자주 나가는 시간", "spend": "돈을 쓰는 곳", "pace": "움직이는 방식"}
# 동네를 고를 때 취향별로 많이 필요한 장소 종류
TASTE_KINDS = {
    "calm": ["산책", "카페"], "active": ["체험"], "new": ["문화", "체험"], "food": ["식사"],
    "cafe": ["카페"], "meal": ["식사"], "drink": ["한잔"], "play": ["체험", "문화"],
}

SYSTEM_PROMPT = """너는 서울 마포구 여가 코스 플래너야. 사용자 취향과 조건에 맞는 코스를 JSON으로 만든다.

규칙
1. 장소는 반드시 [후보 장소]의 ref로만 고른다. 목록에 없는 장소를 만들지 않는다.
2. 코스 하나에 장소 3곳(최소 2, 최대 4). 한 코스 안에서 같은 장소를 반복하지 않고, 코스끼리도 가능하면 겹치지 않게 한다.
   같은 종류(예: 카페)를 세 곳 연달아 넣지 않는다.
3. 이동은 도보다. 좌표가 가까운 장소끼리(구간당 약 1km 이내) 묶는다.
4. 시간 흐름이 자연스러운 순서로 배치하고 start_hour(0~23)를 정한다. 예: 식사→산책→카페, 한잔은 저녁 이후 마지막.
5. 사용자 취향과 사진 태그에 최대한 맞춘다. traits와 tags에는 그 코스의 실제 성격을 적는다.
6. minutes는 그 장소에 머무는 시간(분), cost는 1인 추정 금액(원). 공원·거리·무료 전시는 0.
7. note는 그 장소에서 할 일 한 줄. 영업시간·웨이팅·메뉴·가격처럼 확인되지 않은 사실은 쓰지 않는다.
   '인기', '유명', '맛집', '한적한', '붐비지 않는'처럼 근거 없는 평가·혼잡도 표현은 title·note·why 어디에도 쓰지 않는다.
8. why는 이 사용자에게 왜 맞는지 한두 문장, title은 15자 안팎.
9. 조건의 시간(이동 포함)과 1인 예산을 넘지 않는다.
10. area에는 [만들 코스]에서 지정한 동네를 코스 순서대로 그대로 적는다."""


class Taste(BaseModel):
    mood: str | None = None
    crowd: str | None = None
    hour: str | None = None
    spend: str | None = None
    pace: str | None = None


class Cond(BaseModel):
    area: str = "any"
    hours: int = 0  # 0 = 상관없음
    people: int = 2
    budget: int = 0  # 1인, 0 = 상관없음


class CourseRequest(BaseModel):
    taste: Taste = Field(default_factory=Taste)
    tags: list[str] = []
    intent: str | None = None
    cond: Cond = Field(default_factory=Cond)


class CoursePlanError(Exception):
    pass


def pick_areas(req: CourseRequest) -> list[str]:
    """동네를 골랐으면 그 동네로 3개, '어디든'이면 취향에 필요한 장소가 많은 동네 3곳에 하나씩"""
    if req.cond.area in AREA_CENTERS:
        return [req.cond.area] * N_COURSES
    want = [k for v in (req.intent, req.taste.mood, req.taste.spend) if v for k in TASTE_KINDS.get(v, [])] or COURSE_KINDS
    score = {a: sum(len(candidates_by_area(a).get(k, [])) for k in want) for a in AREA_CENTERS}
    return sorted(AREA_CENTERS, key=lambda a: -score[a])[:N_COURSES]


def sample_candidates(areas: list[str], rng: random.Random) -> dict[str, dict]:
    """동네·종류별로 가까운 곳 위주로 뽑되 매번 조금씩 섞어 코스가 반복되지 않게"""
    uniq = list(dict.fromkeys(areas))
    per_kind = 14 if len(uniq) == 1 else 8
    refs: dict[str, dict] = {}
    used = set()
    for area in uniq:
        by_kind = candidates_by_area(area)
        for kind in COURSE_KINDS:
            pool = by_kind.get(kind, [])[: per_kind * 2]
            for p in rng.sample(pool, min(per_kind, len(pool))):
                if p["id"] not in used:
                    used.add(p["id"])
                    refs[f"p{len(refs) + 1}"] = {**p, "area": area}
    return refs


def build_messages(req: CourseRequest, areas: list[str], refs: dict[str, dict]) -> list[dict]:
    taste = [f"- {TRAIT_NAMES[k]}: {TRAITS[k][v]}" for k, v in req.taste.model_dump().items() if v in TRAITS[k]]
    if req.intent in TRAITS["mood"]:
        taste.append(f"- 오늘 하고 싶은 것: {TRAITS['mood'][req.intent]}")
    if req.tags:
        taste.append(f"- 사진에서 자주 나온 것: {', '.join(t for t in req.tags if t in TAGS)}")
    c = req.cond
    cond = [
        f"- 인원: {c.people}명",
        f"- 시간: {c.hours}시간 이내 (이동 포함)" if c.hours else "- 시간: 상관없음",
        f"- 1인 예산: {c.budget:,}원 이하" if c.budget else "- 1인 예산: 상관없음",
    ]
    places = [f"{ref} | {p['area']} | {p['kind']} | {p['name']} | {p['cat']} | {p['lat']:.4f},{p['lng']:.4f}" for ref, p in refs.items()]
    user = "\n".join([
        "[사용자 취향]", *(taste or ["- 정보 없음 (무난한 코스)"]),
        "", "[조건]", *cond,
        "", f"[만들 코스] {len(areas)}개 — area 순서: {', '.join(areas)}",
        "", "[후보 장소] ref | 동네 | 종류 | 이름 | 업종 | 좌표", *places,
    ])
    return [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}]


def plan_schema(areas: list[str]) -> dict:
    def obj(props: dict) -> dict:
        return {"type": "object", "additionalProperties": False, "required": list(props), "properties": props}

    item = obj({"ref": {"type": "string"}, "minutes": {"type": "integer"}, "cost": {"type": "integer"}, "note": {"type": "string"}})
    course = obj({
        "area": {"type": "string", "enum": sorted(set(areas))},
        "title": {"type": "string"},
        "why": {"type": "string"},
        "start_hour": {"type": "integer"},
        "traits": obj({k: {"type": "string", "enum": list(v)} for k, v in TRAITS.items()}),
        "tags": {"type": "array", "items": {"type": "string", "enum": TAGS}},
        "items": {"type": "array", "items": item},
    })
    return obj({"courses": {"type": "array", "items": course}})


def _call_llm(model: str, messages: list[dict], schema: dict) -> dict:
    from openai import OpenAI, OpenAIError

    if not os.getenv("OPENAI_API_KEY"):
        raise CoursePlanError("OPENAI_API_KEY가 설정되지 않았어요 (backend/.env)")
    # gpt-5 계열(추론 모델)은 minimal이 가장 빠름: 망원 테스트 기준 minimal 14.5초 / low 32.5초 / 기본 약 50초, 결과 품질 비슷
    effort = os.getenv("OPENAI_REASONING_EFFORT", "minimal" if model.startswith(("gpt-5", "o")) else "")
    try:
        res = OpenAI().chat.completions.create(
            model=model, messages=messages,
            response_format={"type": "json_schema", "json_schema": {"name": "course_plan", "strict": True, "schema": schema}},
            **({"reasoning_effort": effort} if effort else {}),
        )
    except OpenAIError as e:
        raise CoursePlanError(f"LLM 호출 실패: {e}") from e
    msg = res.choices[0].message
    if getattr(msg, "refusal", None):
        raise CoursePlanError(f"LLM이 응답을 거절했어요: {msg.refusal}")
    return json.loads(msg.content or "{}")


def leg(a: dict, b: dict) -> dict | None:
    m = meters((a["lat"], a["lng"]), (b["lat"], b["lng"])) * 1.3  # 직선거리 → 골목 우회 반영 추정
    if m > MAX_LEG_M:
        return None
    return {"m": "도보", "t": max(1, math.ceil(m / 75)), "d": f"{m / 1000:.1f}km" if m >= 1000 else f"{round(m / 50) * 50 or 50}m"}


def to_course(index: int, raw: dict, refs: dict[str, dict], cond: Cond) -> dict | None:
    """LLM 코스 1개 검증 → 프론트 Course 형태. 규칙 위반이면 None"""
    places = [refs.get(it["ref"]) for it in raw["items"]]
    if not 2 <= len(places) <= 4 or None in places or len({p["id"] for p in places}) != len(places):
        return None
    kinds = [p["kind"] for p in places]
    if any(kinds[i] == kinds[i + 1] == kinds[i + 2] for i in range(len(kinds) - 2)):
        return None
    if UNVERIFIED.search(" ".join([raw["title"], raw["why"], *(it["note"] for it in raw["items"])])):
        return None
    legs = [leg(a, b) for a, b in zip(places, places[1:])]
    if None in legs:
        return None

    items = [{
        "k": p["kind"], "n": p["name"], "pid": p["id"],
        "d": min(max(it["minutes"], 20), 180), "c": min(max(it["cost"], 0), 150_000), "note": it["note"].strip()[:60],
    } for p, it in zip(places, raw["items"])]
    minutes = sum(i["d"] for i in items) + sum(l["t"] for l in legs)
    if (cond.hours and minutes > cond.hours * 60) or (cond.budget and sum(i["c"] for i in items) > cond.budget):
        return None

    return {
        "id": "ai-" + hashlib.sha1("|".join(i["pid"] for i in items).encode()).hexdigest()[:8],
        "title": raw["title"].strip()[:30], "area": raw["area"], "tint": TINTS[index % len(TINTS)],
        "start": min(max(raw["start_hour"], 7), 22),
        "traits": {k: raw["traits"][k] for k in TRAITS},
        "tags": list(dict.fromkeys(t for t in raw["tags"] if t in TAGS))[:3],
        "why": raw["why"].strip()[:140],
        "items": items, "legs": legs, "estimated": True,
    }


def choose(courses: list[dict]) -> list[dict]:
    """검증 통과 코스 중 최대 N_COURSES개 — 동네가 여러 곳이면 동네마다 하나씩 먼저"""
    seen: set[str] = set()
    first, rest = [], []
    for c in courses:
        (rest if c["area"] in seen else first).append(c)
        seen.add(c["area"])
    chosen = (first + rest)[:N_COURSES]
    for i, c in enumerate(chosen):
        c["tint"] = TINTS[i % len(TINTS)]
    return chosen


def generate_courses(req: CourseRequest, rng: random.Random | None = None) -> dict:
    rng = rng or random.Random()
    areas = pick_areas(req)
    plan_areas = [areas[i % len(areas)] for i in range(N_REQUEST)]
    refs = sample_candidates(areas, rng)
    if len(refs) < 6:
        raise CoursePlanError("이 동네에는 코스를 짤 만큼 장소가 없어요")

    model = os.getenv("OPENAI_MODEL", DEFAULT_MODEL)
    messages = build_messages(req, plan_areas, refs)
    rejected = 0
    for _ in range(2):  # 전부 규칙 위반이면 한 번 더 요청
        courses: list[dict] = []
        for raw in _call_llm(model, messages, plan_schema(plan_areas)).get("courses", []):
            course = to_course(len(courses), raw, refs, req.cond)
            if course is None:
                rejected += 1
            elif all(course["id"] != c["id"] for c in courses):
                courses.append(course)
        if courses:
            return {"courses": choose(courses), "model": model, "candidates": len(refs), "rejected": rejected}
    raise CoursePlanError("조건에 맞는 코스를 만들지 못했어요")
