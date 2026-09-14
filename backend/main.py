import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from courses import CoursePlanError, CourseRequest, generate_courses  # noqa: E402

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
