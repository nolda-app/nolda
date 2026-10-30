"""로그인 API의 기본 플로우: 로그인 화면으로 보내기 → 돌아오기 → 내 정보 확인·수정.
카카오·구글 서버와는 통신하지 않는다 (인가 주소 만들기까지만 실제로 돌리고, code 교환은 대신한다)."""
import pytest

import auth
import main

FRONT = main.FRONTEND_URL
REAL_VERIFY = auth.verify_token  # conftest가 다른 테스트용으로 바꿔 끼우기 전의 실제 함수


def go(client, url, **kw):
    return client.get(url, follow_redirects=False, **kw)


# ── 로그인 화면으로 보내기 ───────────────────────────────

def test_카카오_로그인은_카카오_인가_화면으로_보낸다(client, monkeypatch):
    monkeypatch.setenv("KAKAO_CLIENT_ID", "kid")
    monkeypatch.setenv("KAKAO_REDIRECT_URI", "http://api/cb")
    res = go(client, "/auth/login/kakao")
    assert res.status_code == 307
    assert res.headers["location"].startswith("https://kauth.kakao.com/oauth/authorize?client_id=kid")


def test_구글_로그인은_구글_인가_화면으로_보내고_다른_계정_선택도_된다(client, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "gid")
    monkeypatch.setenv("GOOGLE_LOGIN_REDIRECT_URI", "http://api/cb")
    plain = go(client, "/auth/login/google").headers["location"]
    switch = go(client, "/auth/login/google?switch=1").headers["location"]
    assert plain.startswith("https://accounts.google.com/")
    assert "select_account" not in plain
    assert "select_account" in switch


@pytest.mark.parametrize("path", ["/auth/login/kakao", "/auth/login/google"])
def test_로그인_키가_없으면_500과_이유를_준다(client, monkeypatch, path):
    for k in ("KAKAO_CLIENT_ID", "KAKAO_REDIRECT_URI", "GOOGLE_CLIENT_ID", "GOOGLE_LOGIN_REDIRECT_URI"):
        monkeypatch.delenv(k, raising=False)
    res = go(client, path)
    assert res.status_code == 500
    assert "설정되지 않았어요" in res.json()["detail"]


# ── 소셜 로그인에서 돌아오기 ─────────────────────────────

@pytest.mark.parametrize("provider", ["kakao", "google"])
def test_로그인에_성공하면_토큰을_붙여_앱으로_돌려보낸다(client, monkeypatch, provider):
    monkeypatch.setattr(auth, f"{provider}_callback", lambda code, state: "jwt-token")
    res = go(client, f"/auth/login/{provider}/callback?code=c&state=s")
    assert res.headers["location"] == f"{FRONT}/?login_token=jwt-token"


@pytest.mark.parametrize("provider", ["kakao", "google"])
@pytest.mark.parametrize("query", ["error=access_denied", "state=s", "code=c"])
def test_로그인을_취소하거나_값이_빠지면_앱으로_돌려보낸다(client, provider, query):
    res = go(client, f"/auth/login/{provider}/callback?{query}")
    assert res.headers["location"].startswith(f"{FRONT}/?login_error=")


@pytest.mark.parametrize("provider", ["kakao", "google"])
def test_로그인이_실패하면_사유를_담아_앱으로_돌려보낸다(client, monkeypatch, provider):
    def fail(code, state):
        raise auth.AuthError("로그인 요청이 만료됐어요")
    monkeypatch.setattr(auth, f"{provider}_callback", fail)
    res = go(client, f"/auth/login/{provider}/callback?code=c&state=s")
    assert res.headers["location"].startswith(f"{FRONT}/?login_error=")
    assert "%EB%A1%9C%EA%B7%B8%EC%9D%B8" in res.headers["location"]  # 한글 사유가 주소에 맞게 인코딩된다


def test_토큰으로_사용자를_확인한다(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "s" * 32)
    token = auth.issue_token("user-1")
    assert REAL_VERIFY(token) == "user-1"
    with pytest.raises(auth.AuthError):
        REAL_VERIFY(token + "x")


# ── 내 정보 ──────────────────────────────────────────────

USER = {"id": "user-1", "nickname": "놀다", "email": "a@b.c", "avatar_url": None, "provider": "kakao"}


def test_로그인한_사용자는_내_정보를_볼_수_있다(client, db):
    db.tables["users"] = [dict(USER)]
    res = client.get("/auth/me", headers={"Authorization": "Bearer user-1"})
    assert res.json()["nickname"] == "놀다"


def test_로그인하지_않았거나_만료됐으면_401(client):
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Bearer expired"}).status_code == 401


def test_탈퇴했거나_없는_사용자면_404(client, db):
    assert client.get("/auth/me", headers={"Authorization": "Bearer user-9"}).status_code == 404


def test_이름과_프로필_사진을_바꿀_수_있다(client, db):
    db.tables["users"] = [dict(USER)]
    h = {"Authorization": "Bearer user-1"}
    assert client.patch("/auth/me", json={"nickname": " 새이름 "}, headers=h).json()["nickname"] == "새이름"
    res = client.patch("/auth/me", json={"nickname": "새이름", "avatar_url": "data:image/jpeg;base64,AAAA"}, headers=h)
    assert res.json()["avatar_url"].startswith("data:image/")
    res = client.patch("/auth/me", json={"nickname": "새이름", "avatar_url": ""}, headers=h)  # 빈 값은 기본 아바타로
    assert res.json()["avatar_url"] is None


@pytest.mark.parametrize("body, message", [
    ({"nickname": "   "}, "이름을 입력"),
    ({"nickname": "가" * 21}, "20자"),
    ({"nickname": "ok", "avatar_url": "javascript:alert(1)"}, "이미지 파일만"),
    ({"nickname": "ok", "avatar_url": "data:image/png;base64," + "A" * 200_000}, "용량"),
])
def test_잘못된_이름이나_사진은_400과_이유를_준다(client, db, body, message):
    db.tables["users"] = [dict(USER)]
    res = client.patch("/auth/me", json=body, headers={"Authorization": "Bearer user-1"})
    assert res.status_code == 400
    assert message in res.json()["detail"]


def test_프로필_수정은_로그인해야_한다(client):
    assert client.patch("/auth/me", json={"nickname": "x"}).status_code == 401
