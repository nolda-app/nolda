import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import RedirectResponse  # noqa: E402

import youtube  # noqa: E402
from courses import CoursePlanError, CourseRequest, generate_courses  # noqa: E402

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


@app.get("/auth/youtube/login")
def youtube_login():
    """구글 로그인 화면으로 보내기 (youtube.readonly 권한)"""
    try:
        return RedirectResponse(youtube.login_url())
    except youtube.YoutubeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/auth/youtube/callback")
def youtube_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    """로그인 후 좋아요·구독 집계 → 프론트로 ?yt=<result_id> 붙여서 돌려보내기"""
    if error or not code or not state:
        return RedirectResponse(f"{FRONTEND_URL}/?yt_error={error or 'cancelled'}")
    try:
        result_id = youtube.finish_login(code, state)
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
