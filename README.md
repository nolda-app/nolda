# NOLDA (놀다)

세상에 놀거리는 다양하니까 — AI 여가 코스 설계 서비스

사용자가 조건을 직접 입력하는 대신, AI가 사용자 데이터를 분석해 취향·소비패턴을 파악하고 실행 가능한 여가 코스 타임라인(2~3개 시나리오)을 자동으로 설계해주는 서비스.

MVP 지역: 서울 마포구 한정. 상세 방향은 [2026-09-04 회의 정리](docs/meeting-2026-09-04.md), 데이터 수집·분석 전략은 [2026-09-07 정리](docs/data-strategy-2026-09-07.md) 참고.

## 구조

- `frontend/` — 웹앱 프론트엔드 (React + Vite, PWA)
- `backend/` — FastAPI 백엔드 (추천 시스템, GPT API 연동)
  - `backend/scripts/` — 장소·도보 경로 데이터를 프론트엔드용 파일로 생성하는 스크립트 ([지도·코스 데이터](#지도코스-데이터) 참고)
  - 장소 데이터 수집 파이프라인은 [PLACE_DATA_PIPELINE.md](backend/PLACE_DATA_PIPELINE.md) 참고

## 기술 스택

| 영역 | 기술 |
|---|---|
| 언어 | Python 3.11+ / TypeScript |
| 백엔드 | FastAPI |
| 프론트엔드 | React + Vite, PWA (vite-plugin-pwa) |
| DB | Supabase (Postgres) |
| AI/LLM | GPT API (이미지 분석, 블로그 리뷰 분석, 코스 조합을 AI에 위임) |
| 추천 | scikit-learn — 카드/사진 업로드 기반 이탈도(anomaly) 분석 (루틴 소비 제외, 특이 소비를 취향 신호로) |
| 장소 데이터 | 네이버 검색 API — 지역 검색 (마포구, 업체 상세정보 우선) |
| 지도 | 네이버 지도 API (지도·핀 표시) + TMAP 보행자 경로 API (구간별 도보 거리·시간·경로선) |
| 데이터 수집 | 카드 내역: 앱 스크린샷 업로드 → GPT Vision OCR / 사진첩: `<input type="file">` 직접 선택 → EXIF + GPT Vision |
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
cp .env.example .env  # OPENAI_API_KEY 등 채우기
uvicorn main:app --reload

# frontend (별도 터미널) — 반드시 frontend 폴더에서 실행 (루트에는 package.json 없음)
cd frontend
npm install
cp .env.example .env  # VITE_NAVER_MAP_CLIENT_ID 채우기
npm run dev           # http://localhost:5173
```

- 지도가 안 뜨면 네이버 클라우드 콘솔 → Maps Application → **Web 서비스 URL**에 `http://localhost:5173` 등록 여부 확인

## 지도·코스 데이터

플래너의 코스 10개(`frontend/src/planner/data.ts` `COURSES`)는 전부 마포구 실제 장소로 구성되며, 각 장소는 `pid`로 장소 데이터와 연결된다.

| 파일 | 내용 | 생성 방법 |
|---|---|---|
| `frontend/src/planner/geo.ts` | 장소 658곳을 종류별(식사/카페/한잔/체험/문화/산책/운동)로 정리한 `PLACES` + `placeGeo(id)` | `python backend/scripts/build_places_geo.py` |
| `frontend/src/planner/data.ts` `LEGS` | 코스 구간별 실제 도보 거리·시간 | `python backend/scripts/build_walk_legs.py` |
| `frontend/src/planner/routes.ts` | 지도에 그리는 구간별 도보 경로선 좌표 | 위와 같음 (API 재호출 없이 선만 다시 만들 땐 `--routes-only`) |

- 입력 데이터 `backend/data/places_mapo_coordinates.csv`(좌표 포함 장소 목록)는 git에 포함하지 않음 — 팀 내 별도 공유
- 도보 경로 스크립트는 `backend/.env`의 `TMAP_APP_KEY`(SK open API에서 NOLDA 앱에 **TMAP 상품 연결 필수**) 또는 `ORS_API_KEY`(OpenRouteService, 우선 사용) 필요
- `geo.ts`, `routes.ts`의 자동 생성 구간은 직접 수정하지 말고 스크립트로 재생성

## 로드맵

- Phase 1 (MVP): 로그인, 마포구 네이버 장소 데이터 수집, 최소 조건 입력(체류시간 포함) + 사용자 데이터 기반 자동 추천, 결과 화면(지도 핀·사진·예약 연동 검토), 로그 수집
- Phase 2: 카드/사진 데이터 기반 추천 고도화(개인정보 동의 체계 필요), 유저 기반 협업 필터링, 코스 저장/즐겨찾기, 피드백
- Phase 3: 동행자 추천(관계 데이터 기반), 소셜 기능, B2B 광고 모델, 모바일 전환

## 상태

기획 v1.1(2026-09-01) 이후 [2026-09-04 회의](docs/meeting-2026-09-04.md)에서 추천 방향(조건 선택 → 사용자 데이터 자동 분석)과 로그인 재도입 등 방향 전환.

- 프론트엔드 플래너(v4, 취향 대화) 목업 구현
- 마포구 실제 장소 기반 코스 10개 + 네이버 지도 핀 + TMAP 실제 도보 시간·경로선 연동
- 미구현: 백엔드 API, 취향 기반 코스 자동 생성(현재는 고정 코스 10개를 취향 점수로 정렬), 영업시간·가격 데이터(코스 가격은 추정치)
