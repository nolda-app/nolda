# NOLDA (놀다)

세상에 놀거리는 다양하니까 — AI 여가 코스 설계 서비스

사용자가 조건을 직접 입력하는 대신, AI가 사용자 데이터를 분석해 취향·소비패턴을 파악하고 실행 가능한 여가 코스 타임라인(2~3개 시나리오)을 자동으로 설계해주는 서비스.

MVP 지역: 서울 마포구 한정. 상세 방향은 [2026-09-04 회의 정리](docs/meeting-2026-09-04.md), 데이터 수집·분석 전략은 [2026-09-07 정리](docs/data-strategy-2026-09-07.md) 참고.

## 구조

- `frontend/` — 웹앱 프론트엔드 (React + Vite, PWA)
- `backend/` — FastAPI 백엔드 (추천 시스템, Claude API 연동)

## 기술 스택

| 영역 | 기술 |
|---|---|
| 언어 | Python 3.11+ / TypeScript |
| 백엔드 | FastAPI |
| 프론트엔드 | React + Vite, PWA (vite-plugin-pwa) |
| DB | Supabase (Postgres) |
| AI/LLM | Claude API |
| 추천 | scikit-learn — 카드/사진 업로드 기반 이탈도(anomaly) 분석 (루틴 소비 제외, 특이 소비를 취향 신호로) |
| 장소 데이터 | 네이버 검색 API — 지역 검색 (마포구, 업체 상세정보 우선) |
| 지도 | 네이버 지도 API (경로 조회용) |
| 데이터 수집 | 카드 내역: 앱 스크린샷 업로드 → Claude Vision OCR / 사진첩: `<input type="file">` 직접 선택 → EXIF + Claude Vision |
| 인증 | OAuth2(카카오/네이버/구글) + JWT — 재도입 확정 |
| 배포 | Vercel/Netlify(프론트) + Render(백엔드) |

## 브랜드 컬러

| 용도 | 값 |
|---|---|
| 키 컬러 | `#00A46E` |
| 서브 컬러 | `#D8E64A` |
| 배경색 | `#FAF8F3` |

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

- Phase 1 (MVP): 로그인, 마포구 네이버 장소 데이터 수집, 최소 조건 입력(체류시간 포함) + 사용자 데이터 기반 자동 추천, 결과 화면(지도 핀·사진·예약 연동 검토), 로그 수집
- Phase 2: 카드/사진 데이터 기반 추천 고도화(개인정보 동의 체계 필요), 유저 기반 협업 필터링, 코스 저장/즐겨찾기, 피드백
- Phase 3: 동행자 추천(관계 데이터 기반), 소셜 기능, B2B 광고 모델, 모바일 전환

## 상태

기획 v1.1(2026-09-01) 이후 [2026-09-04 회의](docs/meeting-2026-09-04.md)에서 추천 방향(조건 선택 → 사용자 데이터 자동 분석)과 로그인 재도입 등 방향 전환. 개발 착수 전.
