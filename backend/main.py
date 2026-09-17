import os
from pathlib import Path
from urllib.parse import quote

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from fastapi import FastAPI, Header, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import RedirectResponse  # noqa: E402

import auth  # noqa: E402
import taste  # noqa: E402
import walk  # noqa: E402
import youtube  # noqa: E402
from courses import CoursePlanError, CourseRequest, generate_courses  # noqa: E402
from places import place_details  # noqa: E402

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

app = FastAPI(title="NOLDA API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/courses")
def create_courses(req: CourseRequest):
    """취향·조건으로 LLM 코스 생성. 응답 courses[]는 프론트 Course 형태 + legs(구간 이동)"""
    try:
        return generate_courses(req)
    except CoursePlanError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.get("/places/details")
def get_place_details(ids: str):
    """전화/영업시간/가격 조회 (Supabase places 테이블). ids는 콤마로 구분한 장소 id 목록"""
    return place_details([i for i in ids.split(",") if i])


@app.get("/auth/login/kakao")
def kakao_login():
    """카카오 로그인 화면으로 보내기"""
    try:
        return RedirectResponse(auth.kakao_login_url())
    except auth.AuthError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/auth/login/kakao/callback")
def kakao_login_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    """로그인 후 우리 JWT 발급 → 프론트로 ?login_token=<jwt> 붙여서 돌려보내기"""
    if error or not code or not state:
        return RedirectResponse(f"{FRONTEND_URL}/?login_error={error or 'cancelled'}")
    try:
        token = auth.kakao_callback(code, state)
    except auth.AuthError as e:
        return RedirectResponse(f"{FRONTEND_URL}/?login_error={quote(str(e))}")
    return RedirectResponse(f"{FRONTEND_URL}/?login_token={token}")


@app.get("/auth/login/google")
def google_login():
    """구글 로그인 화면으로 보내기 (openid email — 유튜브 취향 분석용 로그인과 별개)"""
    try:
        return RedirectResponse(auth.google_login_url())
    except auth.AuthError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/auth/login/google/callback")
def google_login_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    """로그인 후 우리 JWT 발급 → 프론트로 ?login_token=<jwt> 붙여서 돌려보내기"""
    if error or not code or not state:
        return RedirectResponse(f"{FRONTEND_URL}/?login_error={error or 'cancelled'}")
    try:
        token = auth.google_callback(code, state)
    except auth.AuthError as e:
        return RedirectResponse(f"{FRONTEND_URL}/?login_error={quote(str(e))}")
    return RedirectResponse(f"{FRONTEND_URL}/?login_token={token}")


@app.get("/auth/me")
def auth_me(authorization: str | None = Header(None)):
    """프론트가 로그인 상태 확인·복원할 때 호출 (Authorization: Bearer <jwt>)"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="로그인이 필요해요")
    try:
        user_id = auth.verify_token(authorization.removeprefix("Bearer "))
    except auth.AuthError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e
    user = auth.get_user(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없어요")
    return user


@app.get("/auth/youtube/login")
def youtube_login():
    """구글 계정 인가 화면으로 보내기 (youtube.readonly 권한 위임 요청 — 로그인이 아님)"""
    try:
        return RedirectResponse(youtube.authorize_url())
    except youtube.YoutubeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/auth/youtube/callback")
def youtube_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    """인가 완료 후 좋아요·구독 집계 → 프론트로 ?yt=<result_id> 붙여서 돌려보내기"""
    if error or not code or not state:
        return RedirectResponse(f"{FRONTEND_URL}/?yt_error={error or 'cancelled'}")
    try:
        result_id = youtube.finish_authorization(code, state)
    except youtube.YoutubeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return RedirectResponse(f"{FRONTEND_URL}/?yt={result_id}")


@app.get("/youtube/taste/{result_id}")
def youtube_taste(result_id: str):
    """좋아요·구독 집계 결과 + 취향 힌트"""
    result = youtube.get_result(result_id)
    if result is None:
        raise HTTPException(status_code=404, detail="분석 결과가 없어요. 다시 분석해 주세요")
    return result


@app.post("/taste/analyze")
def analyze_taste(req: taste.TasteRequest):
    """사진(6) + 유튜브(4)를 LLM이 직접 읽어 고정 주제 값 + 이 사람에게 맞춘 동적 주제 생성.
    사진은 여기서만 쓰고 저장하지 않는다."""
    yt = youtube.get_result(req.yt_id) if req.yt_id else None
    try:
        return taste.analyze(req, yt)
    except taste.TasteError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.post("/walk")
def walk_route(req: walk.WalkRequest):
    """내 위치 → 다음 목적지 보행자 경로 + 회전 안내.
    TMAP 한도를 아끼려고 좌표를 격자로 반올림해 캐시하고, 실패하면 직선 안내로 응답한다."""
    return walk.route(req)
