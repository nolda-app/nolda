# 프론트엔드 구조 재설계 — 페이지 분리 + react-router

작성일: 2026-10-02 · 기준: origin/master `8d32544`

## 왜 하는가

`PlannerApp.tsx`(1568줄, useState 18 · useEffect 18) 하나가 앱 전체를 쥐고, 지금 보일 화면을 **URL이 아니라 플래그 조합의 if-체인**으로 고른다.

```
sharedId → loginError → splash → atHome → !authed → !done&&scan='ask' → 'scanning' → 'summary' → tab + openId모달 + liveId
```

같은 계열 버그가 여기서 반복해서 나왔다.

| 커밋 | 증상 | 구조적 원인 |
|---|---|---|
| 01f7f61 | 화면 안 '뒤로' 버튼이 로그아웃시킴 | 화면 이동 수단이 없어 "전부 초기화" 함수로 이동했고, 거기에 로그아웃이 섞여 있었음 |
| 01f7f61 | 서버가 늦으면 로그인 화면으로 튕김 | 로그인 판단(`!authed`)이 화면 if-체인 한가운데 있음 |
| 027d0be | 직접 접속해도 홈이 뜸 | URL은 `tab/openId/liveId`만 동기화, `atHome/done/scan`은 URL 밖. 수정도 `setDone(true)` 덮어쓰기라 "분석 없이 done" 경로를 하나 더 만듦 |

부가 문제: 공유 링크가 `?course=`와 `/course/:id` 두 갈래, '저장' 탭이 홈 안(`homeTab`)과 코스 화면 안(`tab`)에 두 벌.

## 목표 / 성공 기준

- 화면마다 고유 URL. **화면은 URL만으로 결정**된다.
- 로그인 상태는 화면 흐름과 독립. 토큰을 지우는 코드는 `logout()` 한 곳뿐.
- 뒤로/앞으로/새로고침/직접 접속이 모든 화면에서 자연스럽게 동작.
- 분석 결과는 새로고침해도 유지(`sessionStorage`, 탭 닫으면 사라짐).
- UI·디자인·CSS는 바꾸지 않는다.

범위 밖: `planner.css`(1590줄) 분리 — 다음 PR. 백엔드 변경 없음. E2E 테스트.

## 결정 사항

- 라우터: **react-router-dom** (직접 만든 History API 동기화가 이미 버그를 냈음, 팀 공용 관례).
- 분석 결과 새로고침 대응: **sessionStorage 보관**.
- `/courses`는 분석 없이도 진입 가능(고정 코스 표시). `/search`와 `/courses`는 별개 페이지.

## 1. 라우트

| URL | 페이지 | 로그인 | 비고 |
|---|---|---|---|
| `/` | HomePage | – | 첫 진입 시 스플래시(세션당 1회) |
| `/search` | SearchPage | – | 기존 홈 '검색' 탭 |
| `/saved` | SavedPage | – | 홈 탭·코스 화면 탭 두 벌을 하나로 |
| `/my` | MyPage | – | 프로필 편집 · **로그아웃 버튼은 여기만**. 비로그인이면 기존 MyView의 로그인 유도 화면 |
| `/login` | LoginPage | – | `?next=` 로그인 후 갈 곳, `?error=` 소셜 로그인 실패 안내 |
| `/start` | DataSourcePage | 필요 | 유튜브·사진 고르기 |
| `/scan` | ScanPage | 필요 | 고른 소스 없으면 `/start`로 |
| `/summary` | SummaryPage | 필요 | 분석 결과 없으면 `/start`로 |
| `/courses` | CoursesPage | – | 기존 `SearchTab`(조건 칩 + AI 코스) |
| `/course/:id` | CourseModalRoute | – | 목록 위 모달. 공유 링크도 이 주소 |
| `/course/:id/live` | LivePage | – | |
| `/dev/scan` | ScanDemo | – | `import.meta.env.DEV`일 때만 등록 (기존 `?scan-demo` 대체) |

### 진입 규칙

- **`<RequireAuth>`**: 토큰이 있으면 통과(서버 확인 전이라도). 서버가 401·403·404를 주면 토큰을 지우고 `/login?next=<현재 경로>`로 `replace`. 네트워크 오류·5xx는 토큰 유지(무료 플랜 서버가 잠든 경우).
- **OAuth 복귀(`<OAuthReturn>`)**: 백엔드는 지금처럼 `/?login_token=…`, `/?login_error=…`, `/?yt=…`, `/?yt_error=…`로 돌려보낸다. 앱 최상단 컴포넌트가 쿼리를 읽고 처리한 뒤, 떠나기 전 `sessionStorage`(`nolda:return-to`)에 적어 둔 경로로 `replace` 이동한다. 기존 `AFTER_LOGIN_KEY`·`atHome` 분기를 대체.
  - `login_error` → `/login?error=<코드>`
  - `yt` → 유튜브 연동 id 저장 후 `/scan`, `yt_error` → `/start` (에러 문구 표시)
- **옛 공유 링크**: `/?course=abc` → `/course/abc`로 `replace`. 새로 만드는 공유 URL은 `${origin}/course/:id`.
- **모달 배경**: 목록에서 열 때 `navigate('/course/x', { state: { background: location } })`. `background`가 있으면 그 위치를 `<Routes location={background}>`로 깔고 모달을 위에 띄움. 없으면(직접 접속·공유 링크) `/courses`를 배경으로 깐다. 닫기는 `background`가 있으면 `navigate(-1)`, 없으면 `/courses`로 `replace`.
- **하단 탭바**: `NavLink` 기반. 활성 탭은 URL에서 나온다. `homeTab`·`tab` 상태 제거.
- 홈 계열(`/`, `/search`, `/saved`, `/my`)과 `/courses`는 공통 레이아웃(`<Outlet>` + 하단 탭)을 공유.

### 사라지는 상태

`atHome`, `homeTab`, `tab`, `done`, `scan`, `openId`, `liveId`, `sharedId`, `loginError` (9개). `splash`는 `sessionStorage` 플래그 하나.

## 2. 상태 소유

| 소유자 | 가지는 것 | 영속 | 공개 동작 |
|---|---|---|---|
| **AuthContext** (`state/auth.tsx`) | `token`, `user`, `status: 'checking'\|'in'\|'out'` | localStorage (토큰, 마지막 로그인 수단) | `logout()`, `updateProfile()` |
| **AnalysisContext** (`state/analysis.tsx`) | `report`, `taste`, `tags`, `picks`, `intent`, `hourRange`, `swipes`, `cond`, `ai: {status, ids}`, `skipped` + 메모리 전용 `sources`, `photoFiles` | sessionStorage (`nolda:analysis`) | `setResult()`, `skip()`, `restart()`, `generateAi()` |
| **CourseStore** (`state/courses.tsx`) | `aiPool`, `saved`, `booked` | aiPool: sessionStorage · saved: localStorage + DB | `toggleSave()`, `toggleBook()`, `getCourse(id)`, `addCourses()` |
| 페이지 로컬 | 분석 타이머·ref, `scanN`, `scanReady`, 토스트, 공유 시트 | 없음 | |
| **ScanProvider** (`state/scan.tsx`) | 분석 진행: `scanN`, `ready`, `ytLoading`, `active` + 타이머·ref | 없음 | `start()`, `cancel()`, `reveal()` |

분석 진행을 페이지 로컬이 아니라 Provider에 두는 이유: StrictMode 개발 모드는 마운트 effect를 두 번 실행해 분석이 두 번 시작되고, 유튜브 연동 복귀 시 `/scan` 페이지가 뜨기 전에 분석을 시작해야 한다. 그래서 시작은 버튼 핸들러·진입 처리에서 `start()`로 호출하고, 페이지는 표시만 한다.

### 경계 규칙

- 로그인 관련 effect(`?login_token=` 처리, `fetchMe`)는 AuthContext 안에만. `restart()`는 AuthContext를 모른다 → 화면 버튼이 로그아웃시키는 버그가 구조적으로 불가능.
- `logout()` = 로그인 토큰 삭제 + 유튜브 연동 id 삭제 + `AnalysisContext.restart()` 호출 (마지막 로그인 수단 `nolda:last-login-provider`는 기존처럼 남김). 호출처는 MyPage 로그아웃 버튼 하나.
- `sources`·`photoFiles`는 `/start`에서 고르고 `/scan`에서 쓰므로 AnalysisContext에 두되 영속하지 않는다(`File`은 직렬화 불가). `/scan` 새로고침 → `/start`로. 유튜브 OAuth 왕복은 기존 `photoStash`(IndexedDB) + `nolda:yt-pending`(sources만, auth는 더 이상 넣지 않음)으로 복원.
- `ai.status === 'loading'`으로 저장된 값은 복원 시 `'idle'`로.
- **AI 코스 생성 조건 변경**: 기존 "`done`이 true면 생성" → "`report`가 있거나 `skipped`면 생성". 홈 추천 코스 클릭이 `setDone(true)`로 빈 취향 생성 요청을 보내던 문제가 사라진다. 결과 없이 `/courses` → 고정 코스 + "취향 분석하기" 버튼(→ `/start`).
- `loadPlaces()`는 `App` 최상단에서 한 번.

## 3. 파일 구조

```
src/
  main.tsx              BrowserRouter + AuthProvider/CourseStore/AnalysisProvider
  App.tsx               <Routes>, OAuthReturn, 스플래시, loadPlaces
  routing.test.tsx      라우팅·로그인 규칙 테스트
  state/  auth.tsx  analysis.tsx  courses.tsx
  pages/
    HomeLayout.tsx  HomePage.tsx  SearchPage.tsx  SavedPage.tsx  MyPage.tsx
    LoginPage.tsx  DataSourcePage.tsx  ScanPage.tsx  SummaryPage.tsx
    CoursesPage.tsx  CourseModalRoute.tsx  LivePage.tsx
  components/           여러 페이지가 쓰는 조각 (Chip, HourRange, BudgetSlider, CourseModal, RouteMap, BookButton)
  planner/              기존 부품 유지 (Kiosk, NaverMap, CourseCards, logic, api, data ...)
```

### PlannerApp.tsx 해체 지도

| 현재 (줄) | 이동 |
|---|---|
| 본체 82–716 | `state/*`, `App.tsx`, 각 페이지 |
| `AuthScreen`, `LoginErrorScreen` 718–840 | `LoginPage` |
| `DataSourceScreen` 841–926 | `DataSourcePage` |
| `ScanningScreen` 927–998 + 분석 타이머 로직 | `ScanPage` |
| `SummaryScreen` 999–1136 | `SummaryPage` |
| `HourRange`, `BudgetSlider`, `Chip` 1137–1221 | `components/` |
| `SearchTab`, `AiBanner` 1222–1342 | `CoursesPage` |
| `SavedTab` 1343–1400 | `SavedPage` |
| `CourseModal`, `BookButton`, `RouteMap` 1401–1568 | `components/` + `CourseModalRoute` |

`HomeScreen.tsx`(371)·`HomeViews.tsx`(403)는 탭별로 `HomePage`/`SearchPage`/`SavedPage`/`MyPage` + `HomeLayout`으로 나눈다. 컴포넌트 내부 마크업·클래스명은 그대로 옮긴다. 결과적으로 모든 TSX 파일 250줄 이하.

`/saved`는 기존 앱 안쪽 `SavedTab` 디자인(열기·저장 취소)을 쓰고, 홈 쪽 `SavedView`는 삭제한다. 홈 추천 코스의 상세 모달은 홈 위에 뜬다. 개발용 분석 미리보기는 `/dev/scan` 대신 기존 `?scan-demo` 쿼리를 유지한다.

## 4. 진행 순서 (단계마다 빌드 통과·앱 동작·커밋)

1. `react-router-dom` 설치, `BrowserRouter`로 감싸고 모든 경로 → 기존 `PlannerApp` (동작 변화 없음). vitest 세팅.
2. AuthContext 추출, `RequireAuth` 작성. `PlannerApp`은 context에서 읽음.
3. CourseStore 추출.
4. AnalysisContext 추출(sessionStorage 동기화 포함).
5. 라우트별 이전: 홈 계열(+`HomeLayout`) → 로그인/OAuthReturn → 분석 흐름(`/start`·`/scan`·`/summary`) → `/courses`·모달·live. 이전할 때마다 `PlannerApp` if-체인이 줄어든다.
6. 마무리: `PlannerApp.tsx` 삭제, 옛 `?course=` 리다이렉트, 공유 URL 변경, 수동 History API 코드 삭제, `docs/feature-guide-*.md`의 구조 설명 갱신.

PR 하나, 커밋은 단계별.

## 5. 검증

- 단계마다: `tsc -b`, `vite build`, `oxlint`, `vitest run`.
- `routing.test.tsx` (vitest + @testing-library/react, jsdom, devDependency만):
  1. 토큰 있고 `fetchMe` 미응답 → `/start` 렌더(로그인 화면 아님)
  2. 토큰 있고 `fetchMe` 401 → `/login?next=/start`, 토큰 삭제
  3. `fetchMe` 네트워크 오류 → 토큰 유지
  4. `restart()` 후 토큰 유지, `logout()` 후 토큰 삭제
  5. `/?login_token=x` + `nolda:return-to=/saved` → `/saved`로 replace
  6. `/?course=abc` → `/course/abc`
  7. 분석 결과 없이 `/summary` → `/start`; sessionStorage에 결과 있으면 `/summary` 렌더
- 마지막에 브라우저 수동 확인: 모든 URL 직접 접속, 각 화면 뒤로/앞으로/새로고침, 카카오 로그인 왕복 후 원래 화면 복귀, 유튜브 연동→분석→결과, 공유 링크 신·구 주소.

## 위험

- **모달 배경 패턴**: 직접 접속 시 배경 결정 로직이 틀리면 빈 화면. 테스트 6번과 수동 확인으로 잡는다.
- **CSS 의존**: 일부 스타일이 부모 구조(`.pl-app`, `.pl-screen-fixed > .pl-scroll`)에 기대고 있다. 페이지로 옮길 때 감싸는 요소 구조를 그대로 유지한다.
- **유튜브 OAuth 왕복 중 분석 시작 타이밍**: 기존엔 복귀 effect가 바로 `runScan`. 이제 `/scan`이 마운트되며 시작하므로, `/scan`이 "연동 id는 있는데 데이터 아직" 상태를 기존 `ytLoading` 화면으로 보여줘야 한다.
