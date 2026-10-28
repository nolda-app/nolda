# 테스트 현황

2026-10-28 기준. 방침은 **사용자 동선(플로우)이 끊기지 않는지**를 보는 것이고, 내부 계산 로직까지는 파지 않는다.

## 실행

| 대상 | 명령 | 위치 |
|---|---|---|
| FE e2e | `npx playwright test` | `frontend/` |
| FE 단위·컴포넌트 | `npx vitest run` | `frontend/` |
| BE | `uv run pytest` | `backend/` |
| BE 실제 DB 스모크 | `SMOKE_SUPABASE_URL=… SMOKE_SUPABASE_KEY=… uv run pytest tests/test_supabase_smoke.py -v` | `backend/` |
| 코스 품질 점검 | `python backend/scripts/eval_courses.py --check` | 저장소 루트 |

PR과 master 푸시마다 GitHub Actions(`.github/workflows/test.yml`)가 BE·FE 단위·e2e를 자동으로 돌린다 (아직 GitHub에서 실행해 보지는 않았다).

## FE

| 구분 | 파일 | 개수 | 확인하는 것 |
|---|---|---|---|
| e2e | `e2e/ai-course.spec.ts` | 16 | 사진·유튜브 → 취향 분석 → 요약 → AI 코스. 대기 UX, 분석·코스 실패 시 기본 코스 폴백과 재시도, 분석에 쓰인 기록 안내, AI 코스 저장 |
| e2e | `e2e/login.spec.ts` | 8 | 로그인 필요 화면 → 구글·카카오 로그인 → 원래 화면 복귀, 취소·토큰 거절·만료, 로그아웃, 게스트 저장의 계정 합치기 |
| e2e | `e2e/browse.spec.ts` | 6 | 연결 없이 둘러보기, 기본 코스, 하단 탭 이동, 홈에서 분석 진입, 공유 링크 열기 |
| e2e | `e2e/course-save.spec.ts` | 5 | 코스 저장·취소·새로고침 유지, 게스트 저장의 서버 기록 |
| e2e | `e2e/youtube-link.spec.ts` | 5 | 유튜브 연동 이동·복귀, 취소·만료·실패 안내 |
| 단위·컴포넌트 | `src/**/*.test.ts(x)` 11개 파일 | 65 | 화면 이동(App·entry), 로그인 가드, 홈·분석·스캔 화면, 분석·인증·스캔 상태, 장소 불러오기, 서버 깨우기 |

e2e 합계 40 / 단위 65.

## BE

| 파일 | 개수 | 확인하는 것 |
|---|---|---|
| `tests/test_guest_saved.py` | 16 | 게스트 저장·조회·취소, 잘못된 게스트 ID·코스 거절, 로그인 후 합치기, 코스 생성자 기록 |
| `tests/test_courses_places.py` | 12 | 장소 목록·상세, 코스 생성 저장(DB 실패 시에도 응답), AI 실패 502, 공유 링크 조회 |
| `tests/test_auth.py` | 24 | 카카오·구글 로그인 이동과 콜백, 토큰 확인, 내 정보 조회·수정 검증 |
| `tests/test_external_services.py` | 14 | 카카오·구글 code 교환 → 프로필 → 사용자 저장 → 토큰 발급(응답은 흉내), 거절·만료 state, T맵 응답 변환과 직선 안내 폴백 |
| `tests/test_taste_youtube_walk.py` | 17 | 유튜브 연동 리다이렉트, 연동 결과 조회, 취향 분석 실패 응답, 도보 길안내 폴백·캐시 |
| `tests/test_eval_check.py` | 4 | 코스 품질 점검(`eval_courses.py --check`) 기준선 판정 |
| `tests/test_supabase_smoke.py` | 2 | **실제 Supabase** 게스트 저장→합치기→취소, 장소 조회 (스테이징 키가 있을 때만, 평소엔 건너뜀) |

합계 87 + 스모크 2(건너뜀).

## 한계

- **OpenAI 답변 품질·소요 시간**: 자동 테스트는 실제 호출을 하지 않는다. 성공 응답은 가짜로 대신하고, 실패는 키가 없는 e2e 백엔드의 실제 502를 쓴다. 품질·시간은 `eval_courses.py --check`를 수동 또는 야간으로 돌려 확인한다 (OpenAI 비용·운영 DB 읽기 필요, 기준: 코스 4개·영업시간 안·평균 60초 이내).
- **실제 DB**: 일반 BE 테스트는 메모리 가짜 DB를 쓴다. 실제 쿼리는 `test_supabase_smoke.py`로 스테이징 DB에서 확인하는데, **아직 한 번도 실행하지 못했다** (스테이징 키 없음). `guest_saved_courses` 테이블을 만든 뒤 먼저 돌려 봐야 한다.
- **외부 서비스**: 카카오·구글·T맵은 응답을 흉내 낸다. 실제 서비스의 응답 형식이 바뀌어도 테스트는 모른다. 구글·카카오 동의 화면은 e2e에서 대신한다.
- **CI**: 워크플로를 만들었지만 GitHub에서 실행해 보지는 않았다. 첫 실행에서 환경 차이로 실패할 수 있다.
- **범위 밖**: 취향 점수 계산(`taste.py`), 코스 검증(`courses.py`) 같은 내부 로직, 지도·라이브 길안내 화면.
- **개발 서버 차이**: e2e는 개발 서버(StrictMode)로 돌아 코스 요청이 두 번 나간다. 운영 빌드와 다르다.
- **게스트 저장**: 기본 코스(c1…)는 게스트 기록에만 남고 로그인해도 계정으로 합쳐지지 않는다.

## 남은 작업

- [ ] **실제 DB 스모크 테스트 실행** (보류): 스테이징 Supabase 프로젝트를 준비하고 `users_table.sql` → `courses_table.sql` → `guest_saved_courses.sql`(+ `places_table.sql`, 장소 데이터)을 적용한 뒤 `tests/test_supabase_smoke.py`를 돌린다. 운영 DB에는 돌리지 않는다. 통과하면 이 항목과 위 한계의 "아직 한 번도 실행하지 못했다"를 지운다.
- [ ] 운영 Supabase에 `guest_saved_courses.sql` 적용 (배포 전 필수 — 없으면 게스트 저장이 서버에서 503)
- [ ] GitHub에서 CI 첫 실행 확인
- [ ] `eval_courses.py --check` 첫 실행 후 기준선 조정
