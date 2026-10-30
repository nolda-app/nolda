"""실제 Supabase에 대고 확인하는 스모크 테스트 — 가짜 DB 테스트가 모르는 쿼리·테이블 문제를 잡는다.

평소 `uv run pytest`에서는 건너뛴다. 돌리려면 **운영이 아닌 스테이징(또는 개인 테스트) Supabase 프로젝트**의 값을 따로 준다:

    SMOKE_SUPABASE_URL=... SMOKE_SUPABASE_KEY=<service_role> uv run pytest tests/test_supabase_smoke.py -v

- 준비: users_table.sql → courses_table.sql → guest_saved_courses.sql (+ places_table.sql, 장소 데이터)
- backend/.env의 SUPABASE_*는 읽지 않는다 (실수로 운영 DB에 쓰지 않게). 이 테스트는 데이터를 만들고, 끝나면 만든 것만 지운다.
"""
import os
import uuid

import pytest

URL, KEY = os.getenv("SMOKE_SUPABASE_URL"), os.getenv("SMOKE_SUPABASE_KEY")
pytestmark = pytest.mark.skipif(not (URL and KEY), reason="SMOKE_SUPABASE_URL / SMOKE_SUPABASE_KEY가 없어 건너뜀")

import course_store  # noqa: E402


@pytest.fixture
def smoke(monkeypatch):
    """실제 DB 연결 + 이 테스트가 만든 행을 끝에 지우는 정리"""
    from supabase import create_client

    client = create_client(URL, KEY)
    monkeypatch.setattr(course_store, "get_client", lambda: client)
    import db as db_module
    monkeypatch.setattr(db_module, "get_client", lambda: client)  # places.py가 쓰는 연결

    made = {"users": [], "courses": [], "guests": []}
    yield client, made
    for g in made["guests"]:
        client.table("guest_saved_courses").delete().eq("guest_id", g).execute()
    for c in made["courses"]:
        client.table("courses").delete().eq("id", c).execute()  # saved_courses·course_items는 cascade
    for u in made["users"]:
        client.table("users").delete().eq("id", u).execute()


def new_course(guest_id):
    course = {"title": "스모크 코스", "area": "연남", "start": 12, "tint": "#00A46E", "legs": [{"m": "도보", "t": 5, "d": "300m"}],
              "items": [{"k": "카페", "n": "스모크카페", "d": 60, "c": 7000, "note": "", "pid": None},
                        {"k": "산책", "n": "스모크공원", "d": 40, "c": 0, "note": "", "pid": None}]}
    assert course_store.save_generated([course], {"smoke": True}, None, guest_id), "코스 저장 실패 — courses 테이블/권한 확인"
    return course["id"]


def test_게스트_저장부터_로그인_합치기까지_실제_DB에서_이어진다(smoke):
    client, made = smoke
    guest = str(uuid.uuid4())
    made["guests"].append(guest)
    user = client.table("users").insert({"provider": "smoke", "provider_id": str(uuid.uuid4()), "nickname": "스모크"}).execute().data[0]["id"]
    made["users"].append(user)
    cid = new_course(guest)
    made["courses"].append(cid)

    # 코스를 만든 게스트가 남고, 공유 링크로 다시 열린다
    assert client.table("courses").select("session_id").eq("id", cid).execute().data[0]["session_id"] == guest
    assert course_store.get_course(cid)["title"] == "스모크 코스"

    # 게스트 저장 · 기본 코스 · 조회 · 중복 저장
    assert course_store.save_for_guest(guest, cid) and course_store.save_for_guest(guest, cid)
    assert course_store.save_for_guest(guest, "c1")
    assert [c["id"] for c in course_store.list_saved_guest(guest)] == [cid]
    assert len(client.table("guest_saved_courses").select("id").eq("guest_id", guest).execute().data) == 2

    # 로그인하면 계정으로 합쳐진다 (조인 조회 포함)
    assert course_store.merge_guest_into_user(user, guest) == 1
    assert [c["id"] for c in course_store.list_saved(user)] == [cid]
    merged = client.table("guest_saved_courses").select("course_ref,merged_user_id").eq("guest_id", guest).execute().data
    assert {r["course_ref"]: r["merged_user_id"] for r in merged} == {cid: user, "c1": None}

    # 취소
    course_store.unsave_for_user(user, cid)
    course_store.unsave_for_guest(guest, cid)
    assert course_store.list_saved(user) == [] and course_store.list_saved_guest(guest) == []


def test_장소_테이블을_읽고_상세를_조회할_수_있다(smoke):
    from places import load_places, place_details

    load_places.cache_clear()
    places = load_places()
    assert places, "places 테이블이 비어 있어요 (load_places_to_db.py)"
    first = places[0]
    assert {"id", "name", "lat", "lng", "kind"} <= set(first)
    assert first["id"] in place_details([first["id"]])
    load_places.cache_clear()  # 스모크용 연결이 남지 않게
