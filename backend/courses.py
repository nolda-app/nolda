"""취향·조건 → LLM(GPT)이 후보 장소 안에서만 코스를 짜고, 서버가 검증해 프론트 Course 형태로 반환.

LLM은 장소를 지어내지 못하게 짧은 ref(p1, p2…)로만 고르고, 없는 ref·먼 구간·시간/예산 초과 코스는 서버가 버린다.
"""
import hashlib, json, math, os, random, re

from pydantic import BaseModel, Field

from places import AREA_CENTERS, candidates_by_area, meters

DEFAULT_MODEL = "gpt-5-mini"
N_COURSES = 4  # 응답으로 돌려줄 코스 수
N_REQUEST = 6  # GPT에 요청할 코스 수 — 서버 검증에서 일부 버려져도 4개를 채우기 위해 넉넉히
MAX_LEG_M = 2000  # 도보 한 구간 최대 (직선×1.3 추정)
COURSE_KINDS = ["식사", "카페", "한잔", "체험", "문화", "산책"]
TINTS = ["#00A46E", "#8FBF2E", "#00795A", "#4FA3A5"]
TAGS = ["전시", "야경", "사진", "로컬", "기록", "자연"]
# 데이터로 확인할 수 없는 평가·혼잡도 표현 — 프롬프트로 막아도 새어 나와서 서버에서 한 번 더 거름
UNVERIFIED = re.compile(r"인기|유명|맛집|한적|붐비지|웨이팅")

# 프론트 data.ts Q 옵션과 같은 값·라벨
TRAITS = {
    "mood": {"calm": "힐링·휴식", "active": "운동·액티비티", "new": "새로운 경험", "food": "미식"},
    "crowd": {"busy": "활기찬", "mid": "편안한", "quiet": "조용한"},
    "hour": {"morning": "아침", "noon": "낮", "sunset": "노을 무렵", "night": "밤"},
    "spend": {"meal": "식사", "cafe": "카페·디저트", "drink": "술·바", "play": "전시·체험"},
    "pace": {"low": "적음", "mid": "중간", "high": "많음", "very": "매우 많음"},
}
TRAIT_NAMES = {"mood": "관심사", "crowd": "분위기", "hour": "시간대", "spend": "메인 코스", "pace": "활동성"}
# 일정 밀도 — 코스 성격(traits)이 아니라 코스 짜는 방식이라 따로 둠
# 값: (라벨, 장소 1곳당 평균 분(이동 포함), 장소 수 범위)
PLANS = {
    "tight": ("촘촘하게 여러 곳", 75, (3, 8)),
    "relaxed": ("여유롭게 한 곳에 오래", 120, (2, 5)),
}
COMPANIONS = {"solo": "혼자", "couple": "연인", "friends": "친구", "family": "가족", "coworkers": "동료"}
PLAN_DEFAULT = ("적당히", 95, (2, 6))
# 장소 종류별 현실적인 체류 시간(분). 시간을 꽉 채운다고 밥을 3시간 먹게 하면 안 된다.
STAY_RANGE = {
    "식사": (40, 100), "카페": (30, 120), "한잔": (50, 150),
    "체험": (45, 150), "문화": (30, 120), "산책": (20, 90),
}
STAY_DEFAULT = (30, 120)
# 연달아 두 번 오면 이상한 종류 — 밥 먹고 바로 또 밥, 카페 나와서 또 카페.
# 전시 두 곳 연달아 보기(문화)나 산책은 자연스러워서 뺐다
NO_REPEAT_ADJACENT = {"식사", "카페", "한잔"}
# 동네를 고를 때 취향별로 많이 필요한 장소 종류
TASTE_KINDS = {
    "calm": ["산책", "카페"], "active": ["체험"], "new": ["문화", "체험"], "food": ["식사"],
    "cafe": ["카페"], "meal": ["식사"], "drink": ["한잔"], "play": ["체험", "문화"],
}

SYSTEM_PROMPT = """너는 서울 마포구 여가 코스 플래너야. 사용자 취향과 조건에 맞는 코스를 JSON으로 만든다.

규칙
1. 장소는 반드시 [후보 장소]의 ref로만 고른다. 목록에 없는 장소를 만들지 않는다.
2. 코스 하나의 장소 수는 [조건]의 장소 수를 따른다. 한 코스 안에서 같은 장소를 반복하지 않고, 코스끼리도 가능하면 겹치지 않게 한다.
   식사·카페·한잔은 같은 종류를 연달아 두 곳 넣지 않는다 (밥 먹고 바로 또 밥은 안 된다).
   식사는 한 코스에 최대 2번이고, 두 번이면 점심과 저녁이라 최소 4시간은 떨어져야 한다.
3. 이동은 도보다. 좌표가 가까운 장소끼리(구간당 약 1km 이내) 묶는다.
4. 시간 흐름이 자연스러운 순서로 배치하고 start_hour(0~23)를 정한다. [조건]에 시작 시각이 있으면 start_hour는 그 값이다.
   식사는 점심(12~13시)·저녁(18~19시) 무렵, 한잔은 저녁 이후에 둔다.
5. 사용자 취향과 사진 태그에 최대한 맞춘다. [후보 장소]의 "장소 특징"(가족동반/데이트/모임처럼 그 장소가
   실제로 어떤 손님·상황에 맞는지 나타내는 태그)이 있으면 함께 가는 사람·오늘 하고 싶은 것과 맞는 곳을
   우선 고른다. traits와 tags에는 그 코스의 실제 성격을 적는다.
6. minutes는 그 장소에 머무는 시간(분), cost는 1인 추정 금액(원). 공원·거리·무료 전시는 0.
7. note는 그 장소에서 할 일 한 줄. 영업시간·웨이팅·메뉴·가격처럼 확인되지 않은 사실은 쓰지 않는다.
   '인기', '유명', '맛집', '한적한', '붐비지 않는'처럼 근거 없는 평가·혼잡도 표현은 title·note·why 어디에도 쓰지 않는다.
8. why는 이 사용자에게 왜 맞는지 한두 문장, title은 15자 안팎.
9. [조건]에 시작·종료 시각이 있으면 첫 장소 도착부터 마지막 장소를 떠날 때까지(머무는 시간 + 이동 시간) 그 시간을 채운다.
   시간이 남는다고 한 곳에 오래 머물게 늘리지 말고, [조건]의 장소 수 범위 안에서 장소를 한 곳 더 넣어 채운다.
   시각이 없으면 조건의 시간(이동 포함)을 넘지 않는다. 1인 예산은 넘지 않는다.
11. minutes는 그 장소에서 실제로 보낼 만한 시간이어야 한다. 아래를 넘기지 않는다.
   식사 40~100분 · 카페 30~120분 · 한잔 50~150분 · 체험 45~150분 · 문화(전시) 30~120분 · 산책 20~90분.
   일정이 '촘촘하게'면 이 범위의 아래쪽으로 여러 곳, '여유롭게'면 위쪽으로 적은 곳을 간다.
   밥 한 끼에 3시간, 카페에 3시간처럼 현실에서 하지 않는 시간은 절대 적지 않는다.
12. 함께 가는 사람에 맞춘다. 혼자: 혼자 머물기 편한 곳, 연인: 둘이 대화하기 좋은 곳(장소 특징에 "데이트" 있으면 우선),
    친구: 같이 즐길 거리(장소 특징에 "모임"·"시끌벅적함" 있으면 우선),
    가족: 아이·어른 모두 편하게 쉬어 갈 수 있는 곳(한잔은 빼거나 짧게, 장소 특징에 "가족동반" 있으면 우선),
    동료: 대화하며 식사·한잔하기 좋은 곳. why에도 이유를 적는다.
10. area에는 [만들 코스]에서 지정한 동네를 코스 순서대로 그대로 적는다."""


class Taste(BaseModel):
    mood: str | None = None
    crowd: str | None = None
    hour: str | None = None
    spend: str | None = None
    pace: str | None = None
    plan: str | None = None  # PLANS 키 (일정 밀도)
    companion: str | None = None  # COMPANIONS 키 (함께 가는 사람)


class TimeWindow(BaseModel):
    start: int = Field(ge=0, le=23)  # 시작 시각(시)
    end: int = Field(ge=1, le=24)  # 종료 시각(시), start보다 커야 함

    @property
    def minutes(self) -> int:
        return (self.end - self.start) * 60


class Cond(BaseModel):
    area: str = "any"
    hours: int = 0  # 0 = 상관없음
    people: int = 2
    budget: int = 0  # 1인, 0 = 상관없음


class Picked(BaseModel):
    """taste.py가 만든 동적 주제에서 사용자가 고른 답 — 주제 이름 · 고른 라벨 · 반영 방법 한 줄"""
    name: str
    labels: list[str] = []
    hint: str = ""


class CourseRequest(BaseModel):
    taste: Taste = Field(default_factory=Taste)
    tags: list[str] = []
    intent: str | None = None
    picked: list[Picked] = []
    cond: Cond = Field(default_factory=Cond)
    time_window: TimeWindow | None = None  # 있으면 이 시간을 꽉 채우는 코스만


class CoursePlanError(Exception):
    pass


def plan_of(req: CourseRequest) -> tuple[str, int, tuple[int, int]]:
    return PLANS.get(req.taste.plan or "", PLAN_DEFAULT)


# 체류 시간 상한의 평균 + 구간 이동 — "한 곳에서 최대한 오래 있어도 이만큼"의 기준
PER_PLACE_MAX = sum(hi for _, hi in STAY_RANGE.values()) // len(STAY_RANGE) + 15


def place_range(req: CourseRequest) -> tuple[int, int]:
    """코스 1개의 장소 수 범위 — 시간 창이 있으면 (총 시간 ÷ 1곳당 평균) ±1, 없으면 기존처럼 2~4"""
    if not req.time_window:
        return 2, 4
    _, per, (lo, hi) = plan_of(req)
    n = min(max(round(req.time_window.minutes / per), lo), hi)
    lo, hi = max(lo, n - 1), min(hi, n + 1)
    # 한 곳에 오래 머무는 데도 한도가 있어서, 장소가 적으면 시간을 채울 수가 없다.
    # 체류를 비현실적으로 늘리는 대신 최소 장소 수를 올린다 (밥 한 끼 3시간 방지)
    need = -(-req.time_window.minutes // PER_PLACE_MAX)  # 올림
    return min(max(lo, need), hi), hi


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
    taste = [f"- {TRAIT_NAMES[k]}: {TRAITS[k][v]}" for k, v in req.taste.model_dump().items() if k in TRAITS and v in TRAITS[k]]
    if req.intent in TRAITS["mood"]:
        taste.append(f"- 오늘 하고 싶은 것: {TRAITS['mood'][req.intent]}")
    if req.tags:
        taste.append(f"- 자주 보인 관심사: {', '.join(t for t in req.tags if t in TAGS)}")
    # 기록에서 만든 맞춤 주제 — 사용자가 고른 답을 그대로 넘긴다 (선택지 문구 자체가 이 사람의 취향 설명)
    for p in req.picked:
        if p.labels:
            taste.append(f"- {p.name}: {', '.join(p.labels)}" + (f" ({p.hint})" if p.hint else ""))
    c, w = req.cond, req.time_window
    lo, hi = place_range(req)
    cond = [
        f"- 인원: {c.people}명",
        f"- 시간: {w.start}시 시작 ~ {w.end}시 종료, 총 {w.minutes}분을 꽉 채움 — 코스마다 minutes 합계를 약 {w.minutes - 15 * (lo + hi) // 2}분으로 (이동 제외)" if w
        else f"- 시간: {c.hours}시간 이내 (이동 포함)" if c.hours else "- 시간: 상관없음",
        f"- 일정: {plan_of(req)[0]}",
        f"- 함께 가는 사람: {COMPANIONS.get(req.taste.companion or '', '정보 없음')}",
        f"- 장소 수: 코스마다 {lo}~{hi}곳",
        f"- 1인 예산: {c.budget:,}원 이하" if c.budget else "- 1인 예산: 상관없음",
    ]
    places = [
        f"{ref} | {p['area']} | {p['kind']} | {p['name']} | {p['cat']} | "
        f"{', '.join(p['tags']) if p.get('tags') else '-'} | {p['lat']:.4f},{p['lng']:.4f}"
        for ref, p in refs.items()
    ]
    user = "\n".join([
        "[사용자 취향]", *(taste or ["- 정보 없음 (무난한 코스)"]),
        "", "[조건]", *cond,
        "", f"[만들 코스] {len(areas)}개 — area 순서: {', '.join(areas)}",
        "", "[후보 장소] ref | 동네 | 종류 | 이름 | 업종 | 장소 특징 | 좌표", *places,
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


def fill_stays(stays: list[int], target: int, kinds: list[str]) -> list[int] | None:
    """체류 시간 합이 target(분)과 같도록 비례 조정 (GPT는 총 시간을 자주 짧게 잡아서 서버가 맞춤).
    한도는 장소 종류마다 다르다 — 식당 100분, 산책 90분처럼.
    장소가 너무 많아 시간 안에 안 들어가면 None,
    반대로 한도까지 늘려도 시간이 남으면 늘리지 않고 남겨 둔다(코스가 일찍 끝날 뿐)."""
    n = len(stays)
    bounds = [STAY_RANGE.get(k, STAY_DEFAULT) for k in kinds]
    lo_sum, hi_sum = sum(b[0] for b in bounds), sum(b[1] for b in bounds)
    if target < lo_sum:
        return None
    if target >= hi_sum:
        return [b[1] for b in bounds]

    out = [float(min(max(d, bounds[i][0]), bounds[i][1])) for i, d in enumerate(stays)]
    for _ in range(10):  # 한도에 걸린 곳은 고정하고 나머지로 다시 나눔
        free = [i for i, d in enumerate(out) if bounds[i][0] < d < bounds[i][1]]
        if not free:
            break
        fixed = sum(out[i] for i in range(n) if i not in free)
        scale = (target - fixed) / sum(out[i] for i in free)
        for i in free:
            out[i] = min(max(out[i] * scale, bounds[i][0]), bounds[i][1])
        if abs(sum(out) - target) < 1:
            break
    res = [int(round(d / 5) * 5) for d in out]  # 5분 단위
    # 반올림 오차는 한도 여유가 가장 큰 곳에서 흡수
    diff = target - sum(res)
    if diff:
        i = max(range(n), key=lambda j: bounds[j][1] - res[j] if diff > 0 else res[j] - bounds[j][0])
        res[i] = min(max(res[i] + diff, bounds[i][0]), bounds[i][1])
    return res if all(bounds[i][0] <= res[i] <= bounds[i][1] for i in range(n)) else None


def to_course(index: int, raw: dict, refs: dict[str, dict], req: CourseRequest) -> dict | None:
    """LLM 코스 1개 검증 → 프론트 Course 형태. 규칙 위반이면 None"""
    cond, w = req.cond, req.time_window
    lo, hi = place_range(req)
    places = [refs.get(it["ref"]) for it in raw["items"]]
    if not lo <= len(places) <= hi or None in places or len({p["id"] for p in places}) != len(places):
        return None
    kinds = [p["kind"] for p in places]
    if any(kinds[i] == kinds[i + 1] == kinds[i + 2] for i in range(len(kinds) - 2)):
        return None
    # 밥 먹고 바로 또 밥, 카페 나와서 또 카페 — 프롬프트로 막아도 새어 나와서 서버가 거른다
    if any(kinds[i] == kinds[i + 1] and kinds[i] in NO_REPEAT_ADJACENT for i in range(len(kinds) - 1)):
        return None
    if UNVERIFIED.search(" ".join([raw["title"], raw["why"], *(it["note"] for it in raw["items"])])):
        return None
    legs = [leg(a, b) for a, b in zip(places, places[1:])]
    if None in legs:
        return None

    items = [{
        "k": p["kind"], "n": p["name"], "pid": p["id"],
        "d": min(max(it["minutes"], STAY_RANGE.get(p["kind"], STAY_DEFAULT)[0]), STAY_RANGE.get(p["kind"], STAY_DEFAULT)[1]),
        "c": min(max(it["cost"], 0), 150_000), "note": it["note"].strip()[:60],
    } for p, it in zip(places, raw["items"])]
    move = sum(l["t"] for l in legs)
    if w:  # 시작~종료 시간을 정확히 채우도록 체류 시간 조정
        stays = fill_stays([it["minutes"] for it in raw["items"]], w.minutes - move, kinds)
        if stays is None:
            return None
        for item, d in zip(items, stays):
            item["d"] = d
    elif cond.hours and sum(i["d"] for i in items) + move > cond.hours * 60:
        return None
    if cond.budget and sum(i["c"] for i in items) > cond.budget:
        return None

    return {
        "id": "ai-" + hashlib.sha1("|".join(i["pid"] for i in items).encode()).hexdigest()[:8],
        "title": raw["title"].strip()[:30], "area": raw["area"], "tint": TINTS[index % len(TINTS)],
        "start": w.start if w else min(max(raw["start_hour"], 7), 22),
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
    w = req.time_window
    if w and w.end <= w.start:
        raise CoursePlanError("종료 시각은 시작 시각보다 늦어야 해요")
    areas = pick_areas(req)
    plan_areas = [areas[i % len(areas)] for i in range(N_REQUEST)]
    refs = sample_candidates(areas, rng)
    if len(refs) < 6:
        raise CoursePlanError("이 동네에는 코스를 짤 만큼 장소가 없어요")

    model = os.getenv("OPENAI_MODEL", DEFAULT_MODEL)
    messages = build_messages(req, plan_areas, refs)
    rejected = 0
    courses: list[dict] = []
    for _ in range(2):  # 검증 통과가 N_COURSES개보다 적으면 한 번 더 요청해서 채움
        for raw in _call_llm(model, messages, plan_schema(plan_areas)).get("courses", []):
            course = to_course(len(courses), raw, refs, req)
            if course is None:
                rejected += 1
            elif all(course["id"] != c["id"] for c in courses):
                courses.append(course)
        if len(courses) >= N_COURSES:
            break
    if not courses:
        raise CoursePlanError("조건에 맞는 코스를 만들지 못했어요")
    return {"courses": choose(courses), "model": model, "candidates": len(refs), "rejected": rejected}
