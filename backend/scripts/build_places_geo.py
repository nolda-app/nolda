"""places_mapo_coordinates.csv → frontend/src/planner/geo.ts 의 PLACES 섹션 생성.

실행: python backend/scripts/build_places_geo.py
"""
import csv, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "backend" / "data" / "places_mapo_coordinates.csv"
DST = ROOT / "frontend" / "src" / "planner" / "geo.ts"
MARKER = "// ── 장소 데이터 (자동 생성: backend/scripts/build_places_geo.py — 직접 수정 금지) ──"

# 위에서부터 먼저 걸리는 종류로 분류 (예: '방탈출카페'는 카페가 아니라 체험)
RULES = [
    ("체험", r"방탈출|보드카페|고양이카페|노래방|볼링장|오락실|만화방|암벽등반|스크린야구|야구연습장|멀티방|당구장|PC방|찜질|사우나|목욕|공방|꽃꽂이|캠핑|테마파크|레저,테마"),
    ("운동", r"헬스장|요가원|필라테스|스포츠시설|배드민턴장|구민체육센터"),
    ("문화", r"전시|갤러리|화랑|복합문화공간|영화관|박물관|팝업스토어|서점"),
    ("산책", r"공원|전망대|유적지|거리,골목|도보코스|시장|동물원"),
    ("한잔", r"술집"),
    ("식사", r"브런치|음식점>(?!카페)|한식|양식|일식|육류"),
    ("카페", r"카페|디저트|베이커리"),
]
NAME_RULES = [("체험", r"클라이밍|배팅센터|산악문화")]
KINDS = ["식사", "카페", "한잔", "체험", "문화", "산책", "운동"]


def classify(name: str, cat: str) -> str | None:
    for kind, pat in NAME_RULES:
        if re.search(pat, name):
            return kind
    for kind, pat in RULES:
        if re.search(pat, cat):
            return kind
    return None


def main() -> None:
    with open(SRC, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    groups: dict[str, list[dict]] = {k: [] for k in KINDS}
    unknown = []
    for r in rows:
        kind = classify(r["name"], r["category"])
        (groups[kind] if kind else unknown).append(r)
    if unknown:
        raise SystemExit("분류 안 된 장소: " + ", ".join(f"{r['name']}({r['category']})" for r in unknown))

    s = json.dumps
    lines = [
        MARKER,
        "export type PlaceKind = " + " | ".join(f"'{k}'" for k in KINDS),
        "export interface Place { id: string; name: string; cat: string; addr: string; lat: number; lng: number }",
        "",
        "export const PLACES: Record<PlaceKind, Place[]> = {",
    ]
    for kind in KINDS:
        lines.append(f"  {kind}: [")
        for r in sorted(groups[kind], key=lambda r: r["name"]):
            addr = r["road_address"] or r["address"]
            lines.append(
                f"    {{ id: {s(r['id'])}, name: {s(r['name'], ensure_ascii=False)}, cat: {s(r['category'], ensure_ascii=False)}, "
                f"addr: {s(addr, ensure_ascii=False)}, lat: {float(r['latitude'])}, lng: {float(r['longitude'])} }},"
            )
        lines.append("  ],")
    lines.append("}")

    head = DST.read_text(encoding="utf-8").split(MARKER)[0].rstrip() + "\n\n"
    DST.write_text(head + "\n".join(lines) + "\n", encoding="utf-8")

    print(f"{len(rows)}곳 → {DST.name}")
    for kind in KINDS:
        print(f"  {kind}: {len(groups[kind])}")


if __name__ == "__main__":
    main()
