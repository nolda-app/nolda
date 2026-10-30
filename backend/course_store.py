"""생성된 코스 저장·조회 — Supabase courses / course_items / saved_courses (scripts/courses_table.sql)."""
import logging
import re
import uuid

from db import get_client

log = logging.getLogger(__name__)


def _hhmm(minutes: int) -> str:
    return f"{minutes // 60 % 24:02d}:{minutes % 60:02d}"


def save_generated(courses: list[dict], request: dict, user_id: str | None = None, session_id: str | None = None) -> bool:
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
        # 팀 Supabase courses 테이블에 있는 컬럼만 — 시작 시각·총 시간·금액·출처는 course_json 안에 있음
        rows.append({
            "id": c["id"], "user_id": user_id, "session_id": session_id, "request_json": request,
            "title": c["title"], "area": c["area"], "status": "generated", "course_json": c,
        })
    db = get_client()
    try:
        db.table("courses").insert(rows).execute()
    except Exception as e:  # noqa: BLE001 — 저장 실패가 코스 추천을 막으면 안 됨
        log.warning("코스 DB 저장 실패 (RLS면 backend/.env SUPABASE_KEY를 service_role 키로): %s", e)
        return False
    for c in courses:
        c["shareable"] = True
    try:  # 장소별 타임라인은 분석용이라 없어도 공유·저장에는 지장 없음
        db.table("course_items").insert(items).execute()
    except Exception as e:  # noqa: BLE001
        log.info("course_items 저장 건너뜀 (scripts/courses_table.sql): %s", e)
    return True


BASIC_REF = re.compile(r"^c\d{1,3}$")  # 프론트 기본 코스(c1~) — courses 테이블에는 없다


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


# ── 게스트 저장 (guest_saved_courses — scripts/guest_saved_courses.sql) ─────────────
# 로그인 없이 둘러보는 사용자의 저장도 기록한다. 게스트는 기기가 만든 랜덤 uuid(guest_id)로 구분한다.

def valid_guest_id(guest_id: str | None) -> bool:
    return bool(guest_id) and _valid(guest_id)


def save_for_guest(guest_id: str, course_ref: str) -> bool:
    """게스트 저장에 추가. DB에 있는 코스(uuid)는 실제로 있어야 하고, 기본 코스(c1…)는 그대로 받는다. 아니면 False"""
    if _valid(course_ref):
        if get_course(course_ref) is None:
            return False
    elif not BASIC_REF.match(course_ref):
        return False
    get_client().table("guest_saved_courses").upsert(
        {"guest_id": guest_id, "course_ref": course_ref}, on_conflict="guest_id,course_ref").execute()
    return True


def unsave_for_guest(guest_id: str, course_ref: str) -> None:
    get_client().table("guest_saved_courses").delete().eq("guest_id", guest_id).eq("course_ref", course_ref).execute()


def list_saved_guest(guest_id: str) -> list[dict]:
    """게스트가 저장한 DB 코스 (기본 코스는 프론트가 이미 가지고 있어 돌려주지 않는다)"""
    refs = (get_client().table("guest_saved_courses").select("course_ref")
            .eq("guest_id", guest_id).order("saved_at", desc=True).execute()).data
    return [c for c in (get_course(r["course_ref"]) for r in refs if _valid(r["course_ref"])) if c]


def merge_guest_into_user(user_id: str, guest_id: str) -> int:
    """게스트로 저장해 둔 코스를 계정의 저장한 코스로 합친다 (이미 있으면 그대로). 합친 개수를 돌려준다.
    게스트 기록은 지우지 않고 merged_user_id만 표시한다 — 기본 코스(c1…)는 계정 저장 테이블에 못 담아 게스트 기록에 남는다."""
    db = get_client()
    rows = db.table("guest_saved_courses").select("course_ref").eq("guest_id", guest_id).execute().data
    merged = 0
    for r in rows:
        if _valid(r["course_ref"]) and save_for_user(user_id, r["course_ref"]):
            db.table("guest_saved_courses").update({"merged_user_id": user_id}).eq("guest_id", guest_id).eq("course_ref", r["course_ref"]).execute()
            merged += 1
    return merged
