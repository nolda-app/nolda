"""코스 생성용 장소 후보 (data/places_mapo.csv + data/geocode_cache.json).

필터·분류·중복 제거 규칙은 scripts/build_places_geo.py와 같다 — 지도(geo.ts)와 추천 후보가 같은 장소 집합을 쓰도록.
"""
import csv, html, json, math
from datetime import date
from functools import lru_cache

from scripts.build_places_geo import CACHE, SRC, address_queries, classify, norm, usable

# 프론트 지역 필터(COND area)와 같은 동네 이름 → 기준점
AREA_CENTERS = {
    "연남": (37.5620, 126.9245), "망원": (37.5565, 126.9050), "합정": (37.5496, 126.9139),
    "상수": (37.5478, 126.9227), "홍대": (37.5545, 126.9225), "상암": (37.5680, 126.8870),
}
AREA_RADIUS_M = {"상암": 1500}  # 공원·문화시설이 넓게 퍼져 있음
DEFAULT_RADIUS_M = 900


def meters(a: tuple[float, float], b: tuple[float, float]) -> float:
    dy = (a[0] - b[0]) * 111_000
    dx = (a[1] - b[1]) * 111_000 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot(dx, dy)


@lru_cache(maxsize=1)
def _venue_tags() -> dict[str, list[str]]:
    """places 테이블의 tags(가족동반/데이트/모임 같은 장소 특징) — id -> 태그 목록. DB 접속 실패해도 코스 생성은 계속돼야 하니 빈 dict로 넘어간다"""
    try:
        from db import get_client

        res = get_client().table("places").select("id,tags").execute()
        return {r["id"]: r["tags"] or [] for r in res.data}
    except Exception:
        return {}


@lru_cache(maxsize=1)
def load_places() -> tuple[dict, ...]:
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    venue_tags = _venue_tags()
    today = date.today().isoformat()
    out, seen = [], set()
    with open(SRC, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            r["name"] = html.unescape(r["name"])
            if r.get("event_end") and r["event_end"] < today:
                continue
            if not (r["lat"] and r["lng"]):
                hit = next((cache[q] for q in address_queries(r) if cache.get(q)), None)
                if not hit:
                    continue
                r["lat"], r["lng"] = str(hit[0]), str(hit[1])
            if not usable(r):
                continue
            key = (norm(r["name"]), round(float(r["lat"]), 4), round(float(r["lng"]), 4))
            if key in seen:
                continue
            seen.add(key)
            out.append({
                "id": r["id"], "name": r["name"], "cat": r["category"], "addr": r["road_address"] or r["address"],
                "lat": float(r["lat"]), "lng": float(r["lng"]), "kind": classify(r["name"], r["category"]),
                "venue_tags": venue_tags.get(r["id"], []),
            })
    return tuple(out)


@lru_cache(maxsize=None)
def candidates_by_area(area: str) -> dict[str, list[dict]]:
    """동네 기준점 반경 안의 장소를 종류별로, 가까운 순서대로"""
    center = AREA_CENTERS[area]
    radius = AREA_RADIUS_M.get(area, DEFAULT_RADIUS_M)
    out: dict[str, list[dict]] = {}
    for d, p in sorted(((meters(center, (p["lat"], p["lng"])), p) for p in load_places()), key=lambda x: x[0]):
        if d > radius:
            break
        out.setdefault(p["kind"], []).append(p)
    return out


DETAIL_FIELDS = "id,phone,business_hours,menu_summary,price_per_person,image_url"


def place_details(ids: list[str]) -> dict[str, dict]:
    """places 테이블(scripts/places_table.sql)에서 전화/영업시간/가격/대표사진 조회 — id 기준, 없는 곳은 결과에서 빠짐"""
    if not ids:
        return {}
    from db import get_client

    res = get_client().table("places").select(DETAIL_FIELDS).in_("id", ids).execute()
    return {r["id"]: r for r in res.data}
