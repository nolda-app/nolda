"""저장한 코스 API — 로그인 없이 쓰는 게스트의 저장, 로그인 후 합치기.
요청은 앱이 보내는 그대로 (Authorization: Bearer … / X-Guest-Id: …)."""
import uuid

import main


def gh(guest_id):
    return {"X-Guest-Id": guest_id}


def uh(user_id="user-1", guest_id=None):
    return {"Authorization": f"Bearer {user_id}", **(gh(guest_id) if guest_id else {})}


# ── 게스트 저장 ──────────────────────────────────────────

def test_로그인도_게스트_ID도_없으면_저장할_수_없다(client, course):
    assert client.put(f"/me/saved/{course}").status_code == 401
    assert client.get("/me/saved").status_code == 401


def test_형식이_틀린_게스트_ID는_받지_않는다(client, course):
    assert client.put(f"/me/saved/{course}", headers=gh("not-a-uuid")).status_code == 401


def test_게스트가_저장_조회_취소할_수_있다(client, db, course, guest):
    assert client.put(f"/me/saved/{course}", headers=gh(guest)).json() == {"ok": True}
    assert db.rows("guest_saved_courses")[0]["guest_id"] == guest

    saved = client.get("/me/saved", headers=gh(guest)).json()["courses"]
    assert [c["id"] for c in saved] == [course]
    assert saved[0]["shareable"] is True

    assert client.delete(f"/me/saved/{course}", headers=gh(guest)).json() == {"ok": True}
    assert client.get("/me/saved", headers=gh(guest)).json() == {"courses": []}


def test_같은_코스를_두_번_저장해도_한_번만_남는다(client, db, course, guest):
    for _ in range(2):
        client.put(f"/me/saved/{course}", headers=gh(guest))
    assert len(db.rows("guest_saved_courses")) == 1


def test_게스트마다_저장한_코스가_따로다(client, course, guest):
    client.put(f"/me/saved/{course}", headers=gh(guest))
    assert client.get("/me/saved", headers=gh(str(uuid.uuid4()))).json() == {"courses": []}


def test_없는_코스나_엉뚱한_값은_저장하지_않는다(client, db, guest):
    assert client.put(f"/me/saved/{uuid.uuid4()}", headers=gh(guest)).status_code == 404
    assert client.put("/me/saved/whatever", headers=gh(guest)).status_code == 404
    assert db.rows("guest_saved_courses") == []


def test_기본_코스도_게스트_기록에_남지만_목록에는_나오지_않는다(client, db, guest):
    assert client.put("/me/saved/c1", headers=gh(guest)).status_code == 200
    assert db.rows("guest_saved_courses")[0]["course_ref"] == "c1"
    assert client.get("/me/saved", headers=gh(guest)).json() == {"courses": []}  # 기본 코스는 앱이 이미 가지고 있다


def test_DB가_안_되면_500이_아니라_503과_이유를_준다(client, db, course, guest):
    db.fail = True
    res = client.put(f"/me/saved/{course}", headers=gh(guest))
    assert res.status_code == 503
    assert "DB" in res.json()["detail"]


# ── 로그인 사용자 ────────────────────────────────────────

def test_로그인한_사용자의_저장은_계정에_남고_게스트_기록과_섞이지_않는다(client, db, course, guest):
    client.put(f"/me/saved/{course}", headers=uh("user-1"))
    assert [(r["user_id"], r["course_id"]) for r in db.rows("saved_courses")] == [("user-1", course)]
    assert db.rows("guest_saved_courses") == []
    assert client.get("/me/saved", headers=gh(guest)).json() == {"courses": []}


def test_로그인이_만료됐어도_게스트_ID가_있으면_게스트로_저장한다(client, db, course, guest):
    res = client.put(f"/me/saved/{course}", headers={"Authorization": "Bearer expired", **gh(guest)})
    assert res.status_code == 200
    assert db.rows("guest_saved_courses")[0]["guest_id"] == guest


# ── 로그인하면 합치기 ────────────────────────────────────

def test_게스트로_저장한_코스가_로그인하면_계정으로_합쳐진다(client, db, course, guest):
    client.put(f"/me/saved/{course}", headers=gh(guest))
    client.put("/me/saved/c1", headers=gh(guest))

    res = client.post("/me/saved/merge", headers=uh("user-1", guest))
    assert res.json() == {"merged": 1}  # 기본 코스(c1)는 계정 저장에 담을 수 없다

    assert [(r["user_id"], r["course_id"]) for r in db.rows("saved_courses")] == [("user-1", course)]
    assert db.rows("courses")[0]["status"] == "saved"
    # 게스트 기록은 지우지 않고 누구 계정으로 합쳐졌는지만 표시한다
    by_ref = {r["course_ref"]: r for r in db.rows("guest_saved_courses")}
    assert by_ref[course]["merged_user_id"] == "user-1"
    assert "merged_user_id" not in by_ref["c1"]


def test_합치기를_여러_번_해도_결과는_같다(client, db, course, guest):
    client.put(f"/me/saved/{course}", headers=gh(guest))
    for _ in range(2):
        client.post("/me/saved/merge", headers=uh("user-1", guest))
    assert len(db.rows("saved_courses")) == 1


def test_합치기는_로그인해야_하고_게스트_ID가_없으면_할_일이_없다(client, guest):
    assert client.post("/me/saved/merge", headers=gh(guest)).status_code == 401
    assert client.post("/me/saved/merge", headers=uh("user-1")).json() == {"merged": 0}


# ── AI 코스를 만든 사람 기록 ─────────────────────────────

def _fake_courses():
    return {"courses": [{"title": "AI 코스", "area": "연남", "start": 12, "legs": [],
                         "items": [{"k": "카페", "n": "카페", "d": 60, "c": 7000, "note": "", "pid": None}]}]}


def test_게스트가_만든_AI_코스에는_게스트_ID가_남는다(client, db, monkeypatch, guest):
    monkeypatch.setattr(main, "generate_courses", lambda req: _fake_courses())
    res = client.post("/courses", json={}, headers=gh(guest))
    assert res.status_code == 200
    row = db.rows("courses")[0]
    assert row["session_id"] == guest and row["user_id"] is None
    assert res.json()["courses"][0]["shareable"] is True


def test_로그인한_사용자가_만든_코스는_계정에_남는다(client, db, monkeypatch, guest):
    monkeypatch.setattr(main, "generate_courses", lambda req: _fake_courses())
    client.post("/courses", json={}, headers=uh("user-7", guest))
    assert db.rows("courses")[0]["user_id"] == "user-7"


def test_형식이_틀린_게스트_ID는_코스에_남기지_않는다(client, db, monkeypatch):
    monkeypatch.setattr(main, "generate_courses", lambda req: _fake_courses())
    client.post("/courses", json={}, headers=gh("junk"))
    assert db.rows("courses")[0]["session_id"] is None
