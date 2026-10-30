"""외부 서비스(카카오·구글 로그인 서버, T맵)와 주고받는 부분 — 네트워크는 쓰지 않고 응답만 흉내 낸다.
앞쪽의 test_auth.py는 콜백 함수를 통째로 대신했고, 여기서는 code 교환 → 프로필 조회 → 사용자 저장 → 토큰 발급을 실제 코드로 돌린다.
실제 카카오·구글·T맵이 지금도 이 모양으로 답하는지는 알 수 없다 (응답 형식이 바뀌면 이 테스트로는 모른다)."""
import json
import urllib.error
from types import SimpleNamespace

import pytest

import auth
import main
import walk

REAL_VERIFY = auth.verify_token


def reply(status=200, body=None):
    return SimpleNamespace(status_code=status, text=json.dumps(body or {}), json=lambda: body or {})


@pytest.fixture(autouse=True)
def keys(monkeypatch):
    for k, v in {"JWT_SECRET": "s" * 32, "KAKAO_CLIENT_ID": "kid", "KAKAO_REDIRECT_URI": "http://api/k",
                 "GOOGLE_CLIENT_ID": "gid", "GOOGLE_CLIENT_SECRET": "gsec", "GOOGLE_LOGIN_REDIRECT_URI": "http://api/g"}.items():
        monkeypatch.setenv(k, v)


def state_of(url):
    return url.split("state=")[1].split("&")[0]


@pytest.fixture
def servers(monkeypatch):
    """카카오·구글이 보낼 응답을 주소별로 정해 둔다. 쓴 요청은 calls에 쌓인다"""
    calls, answers = [], {}

    def post(url, **kw):
        calls.append(("POST", url, kw))
        return answers[url]

    def get(url, **kw):
        calls.append(("GET", url, kw))
        return answers[url]

    monkeypatch.setattr(auth.httpx, "post", post)
    monkeypatch.setattr(auth.httpx, "get", get)
    return SimpleNamespace(calls=calls, answers=answers)


KAKAO_TOKEN, KAKAO_ME = "https://kauth.kakao.com/oauth/token", "https://kapi.kakao.com/v2/user/me"
GOOGLE_TOKEN, GOOGLE_ME = "https://oauth2.googleapis.com/token", "https://www.googleapis.com/oauth2/v3/userinfo"


# ── 카카오 ───────────────────────────────────────────────

def test_카카오_로그인을_마치면_사용자가_저장되고_우리_토큰을_받는다(db, servers):
    servers.answers[KAKAO_TOKEN] = reply(200, {"access_token": "kt"})
    servers.answers[KAKAO_ME] = reply(200, {"id": 12345, "kakao_account": {
        "email": "a@b.c", "profile": {"nickname": "놀다", "profile_image_url": "http://img/1.jpg"}}})

    token = auth.kakao_callback("the-code", state_of(auth.kakao_login_url()))

    user = db.rows("users")[0]
    assert user["provider"] == "kakao" and user["provider_id"] == "12345"  # 숫자 id를 문자열로 저장
    assert (user["nickname"], user["email"], user["avatar_url"]) == ("놀다", "a@b.c", "http://img/1.jpg")
    assert REAL_VERIFY(token) == user["id"]
    # 카카오에는 인가 code와 우리 앱 정보를 보냈다
    method, url, kw = servers.calls[0]
    assert url == KAKAO_TOKEN and kw["data"]["code"] == "the-code" and kw["data"]["client_id"] == "kid"
    assert servers.calls[1][2]["headers"]["Authorization"] == "Bearer kt"


def test_카카오에서_이메일_동의를_안_해도_로그인된다(db, servers):
    servers.answers[KAKAO_TOKEN] = reply(200, {"access_token": "kt"})
    servers.answers[KAKAO_ME] = reply(200, {"id": 7})
    auth.kakao_callback("c", state_of(auth.kakao_login_url()))
    assert db.rows("users")[0]["email"] is None and db.rows("users")[0]["nickname"] == ""


def test_같은_카카오_계정으로_다시_로그인하면_같은_사용자다(db, servers):
    servers.answers[KAKAO_TOKEN] = reply(200, {"access_token": "kt"})
    servers.answers[KAKAO_ME] = reply(200, {"id": 7})
    first = auth.kakao_callback("c", state_of(auth.kakao_login_url()))
    second = auth.kakao_callback("c", state_of(auth.kakao_login_url()))
    assert len(db.rows("users")) == 1
    assert REAL_VERIFY(first) == REAL_VERIFY(second)


def test_모르거나_이미_쓴_state는_거절한다(db, servers):
    with pytest.raises(auth.AuthError, match="만료"):
        auth.kakao_callback("c", "made-up")
    servers.answers[KAKAO_TOKEN] = reply(200, {"access_token": "kt"})
    servers.answers[KAKAO_ME] = reply(200, {"id": 7})
    state = state_of(auth.kakao_login_url())
    auth.kakao_callback("c", state)
    with pytest.raises(auth.AuthError, match="만료"):
        auth.kakao_callback("c", state)  # 한 번 쓰면 끝
    assert servers.calls and len(db.rows("users")) == 1


def test_카카오가_code_교환을_거절하면_그_이유로_실패한다(db, servers):
    servers.answers[KAKAO_TOKEN] = reply(400, {"error": "invalid_grant"})
    with pytest.raises(auth.AuthError, match="토큰 교환 실패.*invalid_grant"):
        auth.kakao_callback("bad", state_of(auth.kakao_login_url()))
    assert db.rows("users") == []


def test_카카오_프로필을_못_가져오면_실패한다(db, servers):
    servers.answers[KAKAO_TOKEN] = reply(200, {"access_token": "kt"})
    servers.answers[KAKAO_ME] = reply(401, {"msg": "expired"})
    with pytest.raises(auth.AuthError, match="프로필 조회 실패"):
        auth.kakao_callback("c", state_of(auth.kakao_login_url()))


def test_사용자_저장이_안_되면_로그인_처리_문제로_알린다(db, servers):
    servers.answers[KAKAO_TOKEN] = reply(200, {"access_token": "kt"})
    servers.answers[KAKAO_ME] = reply(200, {"id": 7})
    db.fail = True
    with pytest.raises(auth.AuthError, match="로그인 처리 중"):
        auth.kakao_callback("c", state_of(auth.kakao_login_url()))


# ── 구글 ─────────────────────────────────────────────────

def test_구글_로그인을_마치면_사용자가_저장되고_우리_토큰을_받는다(db, servers):
    servers.answers[GOOGLE_TOKEN] = reply(200, {"access_token": "gt"})
    servers.answers[GOOGLE_ME] = reply(200, {"sub": "g-1", "email": "a@b.c", "name": "구글유저", "picture": "http://img/g.jpg"})

    token = auth.google_callback("the-code", state_of(auth.google_login_url()))

    user = db.rows("users")[0]
    assert (user["provider"], user["provider_id"], user["nickname"]) == ("google", "g-1", "구글유저")
    assert REAL_VERIFY(token) == user["id"]
    assert servers.calls[0][2]["data"]["client_secret"] == "gsec"


def test_구글이_거절하면_이유와_함께_실패한다(db, servers):
    servers.answers[GOOGLE_TOKEN] = reply(401, {"error": "invalid_client"})
    with pytest.raises(auth.AuthError, match="구글 토큰 교환 실패"):
        auth.google_callback("c", state_of(auth.google_login_url()))


def test_교환이_실패하면_앱으로_돌아가며_사유를_알린다(client, servers):
    """주소창에서 열리는 콜백이라, 실패해도 JSON이 아니라 앱으로 돌려보낸다"""
    servers.answers[KAKAO_TOKEN] = reply(400, {"error": "invalid_grant"})
    state = state_of(auth.kakao_login_url())
    res = client.get(f"/auth/login/kakao/callback?code=bad&state={state}", follow_redirects=False)
    assert res.headers["location"].startswith(f"{main.FRONTEND_URL}/?login_error=")
    assert "invalid_grant" in res.headers["location"]


# ── T맵 ──────────────────────────────────────────────────

A, B = [37.5560, 126.9230], [37.5575, 126.9250]
TMAP = {"features": [
    {"geometry": {"type": "Point", "coordinates": [126.9230, 37.5560]},
     "properties": {"totalDistance": 280, "totalTime": 240, "turnType": 200, "description": "출발"}},
    {"geometry": {"type": "LineString", "coordinates": [[126.9230, 37.5560], [126.9240, 37.5568], [126.9250, 37.5575]]},
     "properties": {"distance": 280}},
    {"geometry": {"type": "Point", "coordinates": [126.9250, 37.5575]}, "properties": {"distance": 0, "turnType": 201}},
]}


@pytest.fixture(autouse=True)
def clean_walk(monkeypatch):
    monkeypatch.setattr(walk, "_cache", {})
    monkeypatch.setattr(walk, "_used", {"day": "2000-01-01", "n": 0})
    monkeypatch.setenv("TMAP_APP_KEY", "tkey")


class FakeResponse:
    def __init__(self, body):
        self.body = json.dumps(body).encode()

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        return self.body


def tmap_says(monkeypatch, body=None, error=None):
    sent = []

    def urlopen(request, timeout=0):
        sent.append(request)
        if error:
            raise error
        return FakeResponse(body)
    monkeypatch.setattr(walk.urllib.request, "urlopen", urlopen)
    return sent


def test_T맵_응답을_지도에_그릴_경로와_안내로_바꾼다(client, monkeypatch):
    sent = tmap_says(monkeypatch, TMAP)
    res = client.post("/walk", json={"start": A, "end": B, "end_name": "카페"}).json()

    assert res["source"] == "tmap"
    assert res["path"][0] == A and res["path"][-1] == B  # [경도, 위도]로 온 좌표를 [위도, 경도]로 뒤집는다
    assert (res["meters"], res["minutes"]) == (280, 4)
    assert [s["text"] for s in res["steps"]] == ["출발", "도착"]
    assert sent[0].headers["Appkey"] == "tkey"
    assert json.loads(sent[0].data)["endName"] == "카페"


def test_T맵이_경로를_못_찾으면_직선_안내로_대신한다(client, monkeypatch):
    tmap_says(monkeypatch, {"features": []})
    assert client.post("/walk", json={"start": A, "end": B}).json()["source"] == "straight"


def test_T맵_오류나_접속_실패도_직선_안내로_대신한다(client, monkeypatch):
    tmap_says(monkeypatch, error=urllib.error.URLError("timeout"))
    assert client.post("/walk", json={"start": A, "end": B}).json()["source"] == "straight"


def test_T맵_키가_없으면_부르지_않고_직선_안내(client, monkeypatch):
    sent = tmap_says(monkeypatch, TMAP)
    monkeypatch.delenv("TMAP_APP_KEY")
    assert client.post("/walk", json={"start": A, "end": B}).json()["source"] == "straight"
    assert sent == []
