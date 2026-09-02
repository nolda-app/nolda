# NOLDA (놀다)

세상에 놀거리는 다양하니까 — AI 여가 코스 설계 서비스

예산·시간·위치·인원·목적·취향을 입력받아 AI가 실행 가능한 여가 코스 타임라인(2~3개 시나리오)을 설계해주는 서비스.

## 구조

- `frontend/` — 웹앱 프론트엔드 (React + Vite, PWA)
- `backend/` — FastAPI 백엔드 (인증, 추천 시스템, Claude API 연동)

## 기술 스택

| 영역 | 기술 |
|---|---|
| 언어 | Python 3.11+ / TypeScript |
| 백엔드 | FastAPI |
| 프론트엔드 | React + Vite, PWA (vite-plugin-pwa) |
| DB | SQLite (MVP) → Supabase |
| AI/LLM | Claude API |
| 추천 | scikit-learn (아이템/유저 기반 협업 필터링) |
| 인증 | OAuth2 (카카오/네이버/구글/애플) + JWT |
| 배포 | Vercel/Netlify(프론트) + Render(백엔드) |

## 로컬 실행

```bash
# backend
cd backend
python -m venv .venv && .venv\Scripts\activate  # (Windows)
pip install -r requirements.txt
cp .env.example .env  # ANTHROPIC_API_KEY 등 채우기
uvicorn main:app --reload

# frontend (별도 터미널)
cd frontend
npm install
npm run dev
```

## 로드맵

- Phase 1 (MVP, 4~6주): 로그인, 대화형 온보딩, 조건 입력, AI 코스 생성, 결과 UI, 로그 수집
- Phase 2 (4주): 추천 고도화, 코스 저장/즐겨찾기, 피드백
- Phase 3: 지도 연동, 소셜 기능, 모바일 전환

## 상태

기획 확정 (v1.1, 2026-09-01). 개발 착수 전.
