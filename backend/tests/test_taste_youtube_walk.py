"""취향 분석 플로우의 백엔드 쪽: 유튜브 연동 → 연동 결과 조회 → 취향 분석, 그리고 도보 길안내.
구글·OpenAI·T맵은 부르지 않는다."""
import pytest

import main
import taste
import walk
import youtube

FRONT = main.FRONTEND_URL


def go(client, url):
    return client.get(url, follow_redirects=False)


# ── 유튜브 연동 ──────────────────────────────────────────

def test_유튜브_연동은_구글_인가_화면으로_보낸다(client, monkeypatch):
    monkeypatch.setattr(youtube, "authorize_url", lambda: "https://accounts.google.com/auth")
    assert go(client, "/auth/youtube/login").headers["location"] == "https://accounts.google.com/auth"


def test_인가_주소를_못_만들면_앱으로_돌려보낸다(client, monkeypatch):
    def fail():
        raise youtube.YoutubeError("키 없음")
    monkeypatch.setattr(youtube, "authorize_url", fail)
    assert go(client, "/auth/youtube/login").headers["location"] == f"{FRONT}/?yt_error=failed"


def test_연동이_끝나면_결과_id를_붙여_앱으로_돌려보낸다(client, monkeypatch):
    monkeypatch.setattr(youtube, "finish_authorization", lambda code, state: "result-1")
    assert go(client, "/auth/youtube/callback?code=c&state=s").headers["location"] == f"{FRONT}/?yt=result-1"


def test_연결을_취소하면_사유와_함께_앱으로_돌려보낸다(client):
    assert go(client, "/auth/youtube/callback?error=access_denied").headers["location"] == f"{FRONT}/?yt_error=access_denied"
    assert go(client, "/auth/youtube/callback").headers["location"] == f"{FRONT}/?yt_error=cancelled"


@pytest.mark.parametrize("error", [youtube.YoutubeError("만료"), RuntimeError("네트워크"), KeyError("형식")])
def test_어떤_이유로_실패해도_JSON이_아니라_앱으로_돌려보낸다(client, monkeypatch, error):
    def fail(code, state):
        raise error
    monkeypatch.setattr(youtube, "finish_authorization", fail)
    res = go(client, "/auth/youtube/callback?code=c&state=bad")
    assert res.status_code == 307
    assert res.headers["location"] == f"{FRONT}/?yt_error=failed"


def test_연동_결과를_id로_조회하고_없으면_404(client, monkeypatch):
    monkeypatch.setitem(youtube._results, "r1", {"likes": 3, "subs": 1})
    assert client.get("/youtube/taste/r1").json() == {"likes": 3, "subs": 1}
    res = client.get("/youtube/taste/unknown")
    assert res.status_code == 404
    assert "다시 분석" in res.json()["detail"]


# ── 취향 분석 ────────────────────────────────────────────

def test_분석할_기록이_없으면_502와_이유를_준다(client):
    res = client.post("/taste/analyze", json={"yt_id": None, "photos": []})
    assert res.status_code == 502
    assert res.json()["detail"] == "분석할 기록이 없어요"


def test_만료된_유튜브_id만_보내도_기록이_없는_것으로_본다(client):
    assert client.post("/taste/analyze", json={"yt_id": "expired", "photos": []}).status_code == 502


def test_유튜브_기록과_사진을_함께_분석한다(client, monkeypatch):
    monkeypatch.setitem(youtube._results, "r1", {"likes": 3})
    seen = {}

    def fake(req, yt):
        seen.update(yt=yt, photos=len(req.photos))
        return {"source": "llm"}
    monkeypatch.setattr(taste, "analyze", fake)

    photo = {"ts": "2026-10-01T12:00:00Z", "lat": None, "lng": None, "b64": "data:image/jpeg;base64," + "A" * 64}
    res = client.post("/taste/analyze", json={"yt_id": "r1", "photos": [photo]})
    assert res.json() == {"source": "llm"}
    assert seen == {"yt": {"likes": 3}, "photos": 1}


def test_AI_분석이_실패하면_502와_이유를_준다(client, monkeypatch):
    def fail(req, yt):
        raise taste.TasteError("OPENAI_API_KEY가 설정되지 않았어요")
    monkeypatch.setattr(taste, "analyze", fail)
    res = client.post("/taste/analyze", json={"photos": []})
    assert res.status_code == 502
    assert "OPENAI_API_KEY" in res.json()["detail"]


# ── 도보 길안내 ──────────────────────────────────────────

@pytest.fixture(autouse=True)
def clean_walk(monkeypatch):
    monkeypatch.setattr(walk, "_cache", {})
    monkeypatch.setattr(walk, "_used", {"day": "2000-01-01", "n": 0})


A, B, C = [37.5560, 126.9230], [37.5575, 126.9250], [37.5590, 126.9280]


def test_길찾기가_안_되면_직선_안내로_대신한다(client, monkeypatch):
    def fail(req):
        raise walk.WalkError("T맵 오류")
    monkeypatch.setattr(walk, "_fetch", fail)
    res = client.post("/walk", json={"start": A, "end": B, "end_name": "카페"}).json()
    assert res["source"] == "straight"
    assert res["path"] == [A, B]
    assert res["minutes"] >= 1
    assert "카페" in res["steps"][0]["text"]


def test_같은_구간은_두_번째부터_저장된_결과를_쓴다(client, monkeypatch):
    calls = []
    monkeypatch.setattr(walk, "_fetch", lambda req: calls.append(1) or {"source": "tmap", "path": [req.start, req.end]})
    for _ in range(2):
        assert client.post("/walk", json={"start": A, "end": B}).json()["source"] == "tmap"
    assert len(calls) == 1


def test_하루_한도를_넘으면_호출하지_않고_직선_안내(client, monkeypatch):
    monkeypatch.setattr(walk, "_budget_left", lambda: False)
    monkeypatch.setattr(walk, "_fetch", lambda req: pytest.fail("한도를 넘었는데 T맵을 불렀다"))
    assert client.post("/walk", json={"start": A, "end": B}).json()["source"] == "straight"


def test_코스_장소들을_이으면_구간마다_경로가_나온다(client, monkeypatch):
    monkeypatch.setattr(walk, "_fetch", lambda req: {"source": "tmap", "path": [req.start, req.end]})
    res = client.post("/walk/legs", json={"points": [A, B, C], "names": ["가", "나", "다"]}).json()
    assert len(res["paths"]) == 2  # 장소 3곳 → 구간 2개
    assert res["sources"] == ["tmap", "tmap"]
    assert res["paths"][1] == [B, C]


def test_좌표가_잘못되면_422(client):
    assert client.post("/walk", json={"start": [37.5], "end": B}).status_code == 422
    assert client.post("/walk/legs", json={"points": [A]}).status_code == 422
