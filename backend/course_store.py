"""생성된 코스 저장·조회 — Supabase courses / course_items / saved_courses (scripts/courses_table.sql)."""
import logging
import uuid

from db import get_client

log = logging.getLogger(__name__)


def _hhmm(minutes: int) -> str:
    return f"{minutes // 60 % 24:02d}:{minutes % 60:02d}"


def save_generated(courses: list[dict], request: dict, user_id: str | None = None) -> bool:
    """코스마다 uuid를 붙여 저장. 저장에 성공한 코스만 shareable=True (공유 링크로 다시 열 수 있음).
    테이블이 없거나 DB가 안 돼도 코스 응답은 그대로 나가야 해서 예외를 밖으로 던지지 않는다."""
    rows, items = [], []
    for c in courses:
        c["id"] = str(uuid.uuid4())
        legs = c.get("legs") or []
        t = c["start"] * 60
        for seq, it in enumerate(c["items"]):
            items.append({
                "course_id": c["id"], "seq": seq, "place_id": it.get("pid"), "name": it["n"], "kind": it["k"],
                "time": _hhmm(t), "duration_min": it["d"], "cost": it["c"], "note": it["note"],
            })
            t += it["d"] + (legs[seq]["t"] if seq < len(legs) else 0)
        rows.append({
            "id": c["id"], "user_id": user_id, "request_json": request, "taste_snapshot_json": request.get("taste"),
            "title": c["title"], "area": c["area"], "start_time": _hhmm(c["start"] * 60),
            "total_minutes": t - c["start"] * 60, "total_cost": sum(i["c"] for i in c["items"]),
            "source": c.get("source") or ("rule" if c.get("fallback") else "taste"), "course_json": c,
        })
    try:
        db = get_client()
        db.table("courses").insert(rows).execute()
        db.table("course_items").insert(items).execute()
    except Exception as e:  # noqa: BLE001 — 저장 실패가 코스 추천을 막으면 안 됨
        log.warning("코스 DB 저장 실패 (scripts/courses_table.sql 실행 여부 확인): %s", e)
        return False
    for c in courses:
        c["shareable"] = True
    return True


def _valid(course_id: str) -> bool:
    try:
        uuid.UUID(course_id)
        return True
    except ValueError:
        return False


def get_course(course_id: str) -> dict | None:
    if not _valid(course_id):
        return None
    res = get_client().table("courses").select("course_json").eq("id", course_id).limit(1).execute()
    return {**res.data[0]["course_json"], "id": course_id, "shareable": True} if res.data else None


def list_saved(user_id: str) -> list[dict]:
    res = (get_client().table("saved_courses").select("course_id, courses(course_json)")
           .eq("user_id", user_id).order("saved_at", desc=True).execute())
    return [{**r["courses"]["course_json"], "id": r["course_id"], "shareable": True} for r in res.data if r.get("courses")]


def save_for_user(user_id: str, course_id: str) -> bool:
    """저장한 코스에 추가. 없는 코스면 False"""
    if not _valid(course_id) or get_course(course_id) is None:
        return False
    db = get_client()
    db.table("saved_courses").upsert({"user_id": user_id, "course_id": course_id}, on_conflict="user_id,course_id").execute()
    db.table("courses").update({"status": "saved"}).eq("id", course_id).execute()
    return True


def unsave_for_user(user_id: str, course_id: str) -> None:
    if _valid(course_id):
        get_client().table("saved_courses").delete().eq("user_id", user_id).eq("course_id", course_id).execute()
