"""코스 생성용 장소 후보 — Supabase `places` 테이블에서 읽음.

load_places_csv: 원본 CSV(data/places_mapo.csv + data/geocode_cache.json)에서 읽기. DB 적재 스크립트(scripts/load_places_to_db.py)용.
필터·분류·중복 제거 규칙은 scripts/build_places_geo.py와 같다.
"""
import csv, html, json, math
from pathlib import Path
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


PAGE = 1000  # Supabase 한 번에 최대 1000행
# 업체 대표사진 (Supabase Storage images 버킷에 올린 결과, scripts/scrape_place_images.py).
# places.image_url 컬럼이 있으면 그 값을 먼저 쓰고, 없으면 이 목록으로 채움
IMAGES_CSV = Path(__file__).parent / "data" / "place_images.csv"


@lru_cache(maxsize=1)
def image_urls() -> dict[str, str]:
    if not IMAGES_CSV.exists():
        return {}
    with open(IMAGES_CSV, encoding="utf-8-sig", newline="") as f:
        return {r["pid"]: r["image_url"] for r in csv.DictReader(f) if r["status"] == "ok" and r["image_url"]}


@lru_cache(maxsize=1)
def load_places() -> tuple[dict, ...]:
    """DB의 장소 전체 (서버 켜진 동안 캐시)"""
    from db import get_client

    rows, start = [], 0
    while True:
        res = (get_client().table("places")
               .select("*")
               .order("id").range(start, start + PAGE - 1).execute())
        rows += res.data
        if len(res.data) < PAGE:
            break
        start += PAGE
    return tuple({
        "id": r["id"], "name": r["name"], "cat": r["category"] or "", "addr": r["address"] or "",
        "lat": float(r["lat"]), "lng": float(r["lng"]), "kind": r["kind"],
        "area": r["area"], "tags": r["tags"] or [], "hours": r["business_hours"], "price": r["price_per_person"],
        "img": r.get("image_url") or image_urls().get(r["id"]),
    } for r in rows if r["lat"] is not None and r["lng"] is not None and r["kind"])


@lru_cache(maxsize=1)
def load_places_csv() -> tuple[dict, ...]:
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
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


DETAIL_FIELDS = "id,phone,business_hours,menu_summary,price_per_person"


def place_details(ids: list[str]) -> dict[str, dict]:
    """places 테이블(scripts/places_table.sql)에서 전화/영업시간/가격 조회 — id 기준, 없는 곳은 결과에서 빠짐"""
    if not ids:
        return {}
    from db import get_client

    res = get_client().table("places").select(DETAIL_FIELDS).in_("id", ids).execute()
    return {r["id"]: r for r in res.data}
