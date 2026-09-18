"""내 위치 → 다음 목적지 보행자 길안내 (TMAP 보행자 경로 API).

코스 시작 화면에서 실시간으로 부르기 때문에 두 가지를 지킨다.
- 좌표를 약 20m 격자로 반올림해 캐시 — 걸을 때마다 같은 경로를 다시 사지 않는다.
- 하루 호출 상한(DAILY_LIMIT)을 서버가 직접 센다. 넘으면 직선 안내로 떨어진다.
"""
import json, math, os, urllib.error, urllib.request
from datetime import date

from pydantic import BaseModel, Field

TMAP_URL = "https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1"
GRID = 0.0002  # 약 20m — 이 격자 안에서 다시 물으면 캐시를 쓴다
CACHE_MAX = 500
DAILY_LIMIT = int(os.getenv("TMAP_DAILY_LIMIT", "800"))  # 무료 한도(1,000)보다 여유 있게
WALK_M_PER_MIN = 75

# TMAP 보행자 turnType → 화면에 쓸 짧은 기호·말
TURNS = {
    11: ("↑", "직진"), 12: ("↰", "좌회전"), 13: ("↱", "우회전"), 14: ("↻", "유턴"),
    16: ("↰", "8시 방향 좌회전"), 17: ("↖", "10시 방향 좌회전"),
    18: ("↗", "2시 방향 우회전"), 19: ("↱", "4시 방향 우회전"),
    125: ("⤴", "육교"), 126: ("⤵", "지하보도"), 127: ("⇅", "계단"), 128: ("⇗", "경사로"),
    129: ("⇅", "계단·경사로"),
    184: ("↑", "경유지"), 185: ("↑", "경유지"), 186: ("↑", "경유지"), 187: ("↑", "경유지"),
    200: ("◉", "출발"), 201: ("⚑", "도착"),
    211: ("⇥", "횡단보도"), 212: ("⇤", "좌측 횡단보도"), 213: ("⇥", "우측 횡단보도"),
    214: ("⇕", "엘리베이터"), 215: ("⤵", "지하보도"), 216: ("⤴", "육교"),
    217: ("⤵", "지하보도 계단"), 218: ("⤴", "육교 계단"), 233: ("↑", "직진"),
}

_cache: dict[tuple, dict] = {}
_used = {"day": date.today().isoformat(), "n": 0}


class WalkError(Exception):
    pass


class WalkRequest(BaseModel):
    """from은 파이썬 예약어라 start/end로 받는다. [위도, 경도]"""
    start: list[float] = Field(min_length=2, max_length=2)
    end: list[float] = Field(min_length=2, max_length=2)
    end_name: str = "목적지"


def meters(a: tuple[float, float], b: tuple[float, float]) -> float:
    dy = (a[0] - b[0]) * 111_000
    dx = (a[1] - b[1]) * 111_000 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot(dx, dy)


def _key(req: WalkRequest) -> tuple:
    return tuple(round(v / GRID) for v in (*req.start, *req.end))


def _budget_left() -> bool:
    today = date.today().isoformat()
    if _used["day"] != today:
        _used.update(day=today, n=0)
    return _used["n"] < DAILY_LIMIT


def straight(req: WalkRequest) -> dict:
    """API를 못 쓸 때 — 직선 거리로만 안내 (지도에는 점선으로 그려진다)"""
    m = meters((req.start[0], req.start[1]), (req.end[0], req.end[1]))
    return {
        "source": "straight",
        "path": [req.start, req.end],
        "meters": round(m),
        "minutes": max(1, round(m / WALK_M_PER_MIN)),
        "steps": [{"mark": "↑", "text": f"{req.end_name} 방향으로 이동", "meters": round(m),
                   "lat": req.end[0], "lng": req.end[1]}],
    }


def _fetch(req: WalkRequest) -> dict:
    key = os.getenv("TMAP_APP_KEY", "")
    if not key:
        raise WalkError("TMAP_APP_KEY가 설정되지 않았어요 (backend/.env)")
    body = {
        "startX": req.start[1], "startY": req.start[0],
        "endX": req.end[1], "endY": req.end[0],
        "startName": "출발", "endName": req.end_name[:20] or "목적지",
        "reqCoordType": "WGS84GEO", "resCoordType": "WGS84GEO",
    }
    request = urllib.request.Request(
        TMAP_URL, data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json", "Accept": "application/json", "appKey": key},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as res:
            geo = json.load(res)
    except urllib.error.HTTPError as e:
        raise WalkError(f"TMAP 오류 {e.code}: {e.read().decode(errors='replace')[:200]}") from e
    except Exception as e:
        raise WalkError(f"TMAP 호출 실패: {e}") from e

    feats = geo.get("features", [])
    if not feats:
        raise WalkError("경로를 찾지 못했어요")
    props = feats[0].get("properties", {})
    # LineString = 지도에 그릴 선, Point = 회전 안내 지점
    path = [[pt[1], pt[0]] for f in feats if f["geometry"]["type"] == "LineString" for pt in f["geometry"]["coordinates"]]
    steps = []
    for f in feats:
        if f["geometry"]["type"] != "Point":
            continue
        pr = f["properties"]
        mark, word = TURNS.get(pr.get("turnType", 11), ("↑", "직진"))
        text = pr.get("description") or word
        lng, lat = f["geometry"]["coordinates"][:2]
        steps.append({"mark": mark, "text": text, "meters": round(pr.get("distance", 0)), "lat": lat, "lng": lng})
    return {
        "source": "tmap",
        "path": path or [req.start, req.end],
        "meters": round(props.get("totalDistance", 0)),
        "minutes": max(1, round(props.get("totalTime", 0) / 60)),
        "steps": steps,
    }


def route(req: WalkRequest) -> dict:
    """같은 격자 안이면 캐시, 한도를 넘었거나 실패하면 직선 안내로 떨어진다"""
    k = _key(req)
    if k in _cache:
        return _cache[k]
    if not _budget_left():
        return straight(req)
    try:
        out = _fetch(req)
    except WalkError:
        return straight(req)
    _used["n"] += 1
    if len(_cache) >= CACHE_MAX:
        _cache.clear()
    _cache[k] = out
    return out


class LegsRequest(BaseModel):
    """코스 장소들을 순서대로 이은 구간별 도보 경로. points = [[위도, 경도], ...]"""
    points: list[list[float]] = Field(min_length=2)
    names: list[str] = []


def legs(req: LegsRequest) -> dict:
    """장소 N개 → 구간 N-1개의 경로선. 한 구간이라도 실패하면 그 구간만 직선으로 떨어진다.

    route()가 격자 캐시와 하루 한도를 이미 책임지므로 여기서는 구간을 이어 붙이기만 한다."""
    paths, sources = [], []
    for i in range(len(req.points) - 1):
        a, b = req.points[i], req.points[i + 1]
        name = req.names[i + 1] if i + 1 < len(req.names) else "목적지"
        out = route(WalkRequest(start=a[:2], end=b[:2], end_name=name))
        paths.append(out["path"])
        sources.append(out["source"])
    return {"paths": paths, "sources": sources}
