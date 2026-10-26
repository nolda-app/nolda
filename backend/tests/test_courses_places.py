"""장소 · 코스 API의 기본 플로우: 장소 목록 → 코스 만들기 → 공유 링크로 다시 열기."""
import uuid

import pytest

import main
from courses import CoursePlanError


def test_서버가_살아있는지_확인할_수_있다(client):
    assert client.get("/health").json() == {"status": "ok"}


# ── 장소 ─────────────────────────────────────────────────

PLACE = {"id": "p1", "name": "테스트카페", "cat": "카페", "addr": "서울 마포구", "lat": 37.55, "lng": 126.92,
         "img": None, "kind": "카페", "area": "연남", "tags": ["감성"], "secret": "응답에 나가면 안 되는 값"}


def test_장소_목록은_화면에_필요한_항목만_내려준다(client, monkeypatch):
    monkeypatch.setattr(main, "load_places", lambda: (PLACE,))
    body = client.get("/places").json()
    assert [p["id"] for p in body] == ["p1"]
    assert "secret" not in body[0]
    assert body[0]["name"] == "테스트카페"


def test_장소_DB가_안_되면_503과_이유를_준다(client, monkeypatch):
    def boom():
        raise RuntimeError("연결 실패")
    monkeypatch.setattr(main, "load_places", boom)
    res = client.get("/places")
    assert res.status_code == 503
    assert "연결 실패" in res.json()["detail"]


def test_장소_상세는_쉼표로_구분한_id_목록으로_조회한다(client, monkeypatch):
    seen = []
    monkeypatch.setattr(main, "place_details", lambda ids: seen.append(ids) or {i: {"phone": "02"} for i in ids})
    res = client.get("/places/details", params={"ids": "p1,p2,,"})
    assert seen == [["p1", "p2"]]  # 빈 항목은 버린다
    assert set(res.json()) == {"p1", "p2"}


# ── 코스 만들기 ──────────────────────────────────────────

def _planned():
    return {"courses": [{"title": "AI 코스", "area": "연남", "start": 12, "legs": [{"m": "도보", "t": 5, "d": "300m"}],
                         "items": [{"k": "카페", "n": "카페", "d": 60, "c": 7000, "note": "", "pid": None},
                                   {"k": "산책", "n": "공원", "d": 40, "c": 0, "note": "", "pid": None}]}]}


def test_취향으로_코스를_만들면_저장되어_공유할_수_있다(client, db, monkeypatch):
    monkeypatch.setattr(main, "generate_courses", lambda req: _planned())
    body = client.post("/courses", json={"tags": ["감성"]}).json()

    course = body["courses"][0]
    assert uuid.UUID(course["id"])  # 저장하면서 uuid가 붙는다
    assert course["shareable"] is True
    assert db.rows("courses")[0]["request_json"]["tags"] == ["감성"]  # 어떤 조건으로 만들었는지 남는다
    assert len(db.rows("course_items")) == 2


def test_DB가_안_돼도_코스는_그대로_내려간다(client, db, monkeypatch):
    monkeypatch.setattr(main, "generate_courses", lambda req: _planned())
    db.fail = True
    res = client.post("/courses", json={})
    assert res.status_code == 200
    assert res.json()["courses"][0]["title"] == "AI 코스"
    assert "shareable" not in res.json()["courses"][0]  # 공유 링크로는 못 연다


def test_AI가_코스를_못_만들면_502와_이유를_준다(client, monkeypatch):
    def fail(req):
        raise CoursePlanError("LLM 호출 실패")
    monkeypatch.setattr(main, "generate_courses", fail)
    res = client.post("/courses", json={})
    assert res.status_code == 502
    assert res.json()["detail"] == "LLM 호출 실패"


def test_조건이_잘못된_요청은_422(client):
    assert client.post("/courses", json={"tags": "감성"}).status_code == 422


# ── 공유 링크로 다시 열기 ────────────────────────────────

def test_공유_링크로_저장된_코스를_다시_열_수_있다(client, course):
    res = client.get(f"/courses/{course}")
    assert res.status_code == 200
    assert res.json()["title"] == "테스트 코스"
    assert res.json()["shareable"] is True


@pytest.mark.parametrize("course_id", [str(uuid.uuid4()), "not-a-uuid"])
def test_없는_코스나_이상한_주소는_404(client, db, course_id):
    assert client.get(f"/courses/{course_id}").status_code == 404


def test_코스_DB가_안_되면_503(client, db, course):
    db.fail = True
    assert client.get(f"/courses/{course}").status_code == 503
