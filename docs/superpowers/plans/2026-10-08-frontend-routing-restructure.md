# 프론트엔드 구조 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1568줄 `PlannerApp.tsx`의 플래그 if-체인을 없애고, URL 하나가 화면을 결정하는 react-router 기반 페이지 구조로 바꾼다. UI는 그대로.

**Architecture:** `main.tsx`에서 `BrowserRouter` + Provider 5개(Toast → Auth → Courses → Analysis → Scan)로 감싼다. `App.tsx`가 라우트 표를 갖고, 각 화면은 `pages/*`의 파일 하나. 상태는 성격별로 `state/*`가 소유하고 페이지는 필요한 것만 꺼내 쓴다. 기존 마크업은 위치만 옮긴다.

**Tech Stack:** React 19, Vite 8, TypeScript 6, react-router-dom 7, vitest + jsdom + @testing-library/react (dev only)

**Spec:** `docs/superpowers/specs/2026-10-02-frontend-routing-restructure-design.md`

**기준 커밋:** origin/master `8d32544`. 아래 "`PlannerApp.tsx` N–M줄"은 전부 이 커밋 기준 줄 번호다. 옮기기 전에 `git show 8d32544:frontend/src/planner/PlannerApp.tsx | sed -n 'N,Mp'`로 원문을 확인할 수 있다.

**작업 위치:** 브랜치 `refactor/frontend-pages` (이미 있음, upstream 없음). 명령은 전부 `frontend/`에서 실행.

## Global Constraints

- 마크업·className·인라인 style은 바꾸지 않는다. 옮기는 컴포넌트는 본문을 그대로 복사하고, **props와 콜백 연결만** 바꾼다.
- `planner.css`는 수정하지 않는다 (CSS 분리는 다음 PR).
- 백엔드는 수정하지 않는다. 백엔드는 계속 `/?login_token=` · `/?login_error=` · `/?yt=` · `/?yt_error=`로 돌려보낸다.
- 새 런타임 의존성은 `react-router-dom` 하나뿐. 테스트 도구는 devDependencies.
- storage 키 이름 유지: `nolda:login-token`, `nolda:last-login-provider`, `nolda:yt-id`, `nolda:yt-pending`, `nolda:saved-courses`. 새 키: `nolda:guest`, `nolda:return-to`, `nolda:analysis`, `nolda:ai-pool`, `nolda:splashed`.
- localStorage/sessionStorage 접근은 전부 `try/catch` (사파리 사생활 보호 모드에서 throw).
- 로그인 토큰을 지우는 코드는 `state/auth.tsx`의 `clear()` 하나뿐이어야 한다.
- 모든 TSX 파일 250줄 이하.
- 매 Task 끝 검증: `npx tsc -b && npx vite build && npx oxlint && npx vitest run` 전부 통과.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. push는 하지 않는다.

## Review Focus

1. **React StrictMode 이중 실행** — 개발 모드에서 effect가 두 번 돈다. OAuth 복귀 처리·분석 시작이 두 번 일어나면 안 된다 → `EntryHandler`는 ref 가드, 분석 시작은 effect가 아니라 핸들러에서(Task 5). Task 8 테스트 "StrictMode에서 유튜브 복귀는 한 번만"이 `fetchYoutubeTaste` 호출 1회를 확인.
2. **로그인 직후 서버가 토큰을 거부** — 카카오에서 막 받은 토큰이 `fetchMe`에서 실패하면 조용히 로그아웃 상태가 되면 안 되고 `/login?error=`로 안내해야 한다 → Task 3 테스트 "fresh 토큰 실패".
3. **sessionStorage에 깨진 JSON / 옛 형식** — `nolda:analysis`가 손상돼 있으면 빈 상태로 시작해야지 흰 화면이 되면 안 된다 → Task 4 테스트 "깨진 JSON".
4. **존재하지 않는 코스 id로 직접 접속** — `/course/없는id`는 안내 토스트 후 `/courses`로 가야 한다 → Task 6 테스트.
5. **분석 중 취소 후 늦게 끝난 분석** — 취소한 분석이 나중에 끝나 `/summary`로 끌고 가면 안 된다 → Task 5 테스트 "cancel 후 결과 무시".

---

## File Structure

```
frontend/src/
  main.tsx                 BrowserRouter + Provider 5개, planner.css import
  App.tsx                  라우트 표, EntryHandler, 스플래시, loadPlaces
  entry.ts                 URL 쿼리 → 진입 동작 (순수 함수) + return-to 저장소
  entry.test.ts
  state/
    toast.tsx              ToastProvider, useToast
    auth.tsx               AuthProvider, useAuth, RequireAuth
    auth.test.tsx
    courses.tsx            CoursesProvider, useCourses (aiPool·saved·booked)
    analysis.tsx           AnalysisProvider, useAnalysis, useBuilt, RequireReport, HOUR_DEFAULT, hourBucket
    analysis.test.tsx
    scan.tsx               ScanProvider, useScan, SCAN_* 상수 (분석 진행 엔진)
    scan.test.tsx
  App.test.tsx             진입 처리(EntryHandler) 테스트
  components/
    Controls.tsx           Chip, HourRange, BudgetSlider
    CourseModal.tsx        CourseModal, BookButton, RouteMap
    HomeParts.tsx          Hero, RecCourses, MOODS, useReveal, pickPlaces (기존 HomeScreen 20–178줄)
  pages/
    TabLayout.tsx          .pl-app + <Outlet> + BottomTabs (URL로 활성 탭)
    usePlaces.ts           장소 목록 로드 훅
    HomePage.tsx           (기존 HomeScreen의 home 탭)
    CourseModalRoute.test.tsx
    SearchPage.tsx         (기존 HomeScreen의 search 탭, ?kind=)
    SavedPage.tsx          (기존 SavedTab)
    MyPage.tsx             (기존 HomeScreen의 my 탭, 로그아웃 버튼)
    CoursesPage.tsx        (기존 SearchTab + AiBanner)
    CourseModalRoute.tsx   /course/:id
    LivePage.tsx           /course/:id/live
    LoginPage.tsx          (기존 AuthScreen + LoginErrorScreen)
    DataSourcePage.tsx     (기존 DataSourceScreen)
    ScanPage.tsx           (기존 ScanningScreen)
    SummaryPage.tsx        (기존 SummaryScreen)
  planner/                 기존 부품 유지. 삭제: PlannerApp.tsx, HomeScreen.tsx. 수정: HomeViews.tsx(SavedView 삭제), ScanDemo.tsx(import 경로)
```

Spec과 달라진 점 (Task 0에서 spec에 반영):
- 분석 진행(타이머·ref)은 페이지 로컬이 아니라 `state/scan.tsx`. 이유: StrictMode가 마운트 effect를 두 번 돌려 분석이 두 번 시작되고, 유튜브 복귀 직후 페이지 마운트 전에 분석을 시작해야 해서.
- `/my`는 로그인 불필요 (기존 `MyView`가 비로그인 화면을 이미 가지고 있음).
- `/saved`는 기존 앱 안쪽 `SavedTab`(열기·저장 취소 가능) 디자인을 쓴다. 홈 쪽 `SavedView`는 삭제.
- 홈 추천 코스를 누르면 모달이 **홈 위에** 뜬다(이전엔 코스 목록 위).
- `/dev/scan` 라우트는 만들지 않고 기존 `?scan-demo` 쿼리를 유지한다 (개발용이라 쿼리 하나로 충분).

---

### Task 0: spec에 변경점 반영

**Files:**
- Modify: `docs/superpowers/specs/2026-10-02-frontend-routing-restructure-design.md`

- [ ] **Step 1: 라우트 표의 `/my` 행 수정**

`| `/my` | MyPage | 필요 | 프로필 편집 · **로그아웃 버튼은 여기만** |` →
`| `/my` | MyPage | – | 프로필 편집 · **로그아웃 버튼은 여기만**. 비로그인이면 기존 MyView의 로그인 유도 화면 |`

- [ ] **Step 2: "## 2. 상태 소유" 표 아래에 추가**

```markdown
| **ScanProvider** (`state/scan.tsx`) | 분석 진행: `scanN`, `ready`, `ytLoading`, `active` + 타이머·ref | 없음 | `start()`, `cancel()`, `reveal()` |

분석 진행을 페이지 로컬이 아니라 Provider에 두는 이유: StrictMode 개발 모드는 마운트 effect를 두 번 실행해 분석이 두 번 시작되고, 유튜브 연동 복귀 시 `/scan` 페이지가 뜨기 전에 분석을 시작해야 한다. 그래서 시작은 버튼 핸들러·진입 처리에서 `start()`로 호출하고, 페이지는 표시만 한다.
```

- [ ] **Step 3: "### 3. 파일 구조" 아래 `HomeScreen.tsx`... 문단 끝에 추가**

```markdown
`/saved`는 기존 앱 안쪽 `SavedTab` 디자인(열기·저장 취소)을 쓰고, 홈 쪽 `SavedView`는 삭제한다. 홈 추천 코스의 상세 모달은 홈 위에 뜬다. 개발용 분석 미리보기는 `/dev/scan` 대신 기존 `?scan-demo` 쿼리를 유지한다.
```

- [ ] **Step 4: Commit**

```bash
git add ../docs/superpowers/specs/2026-10-02-frontend-routing-restructure-design.md
git commit -m "docs: spec 보완 — 분석 진행은 ScanProvider, /my 비로그인 허용, /saved 디자인 통일

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: 라우터·테스트 도구 설치, 수동 History 동기화 제거

**Files:**
- Modify: `frontend/package.json` (npm이 수정)
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/planner/PlannerApp.tsx:157-182` (삭제)

**Interfaces:**
- Produces: 앱 전체가 `<BrowserRouter>` 안. `planner.css`는 `main.tsx`에서 import. `npx vitest run` 동작.

- [ ] **Step 1: 의존성 설치**

```bash
npm i react-router-dom@^7
npm i -D vitest jsdom @testing-library/react @testing-library/dom
```

Expected: `package.json` dependencies에 `react-router-dom`, devDependencies에 4개 추가. `npx vitest --version`이 버전을 출력. vite 8과 peer 충돌로 설치가 거부되면 멈추고 사용자에게 보고(임의로 `--force` 쓰지 말 것).

- [ ] **Step 2: `vite.config.ts`에 테스트 설정**

파일 맨 위에 한 줄 추가:

```ts
/// <reference types="vitest/config" />
```

`defineConfig({ ... })` 객체의 `plugins` 배열 뒤에 추가:

```ts
  test: { environment: 'jsdom' },
```

- [ ] **Step 3: `main.tsx` 교체**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './planner/planner.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
```

`PlannerApp.tsx` 27줄 `import './planner.css'`는 그대로 둬도 된다(같은 파일 중복 import는 한 번만 적용). Task 10에서 파일째 사라진다.

- [ ] **Step 4: `App.tsx` 교체 — 지금은 모든 경로가 PlannerApp**

```tsx
import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import PlannerApp from './planner/PlannerApp'

// 개발 서버에서만: ?scan-demo 로 분석 화면 모션 미리보기 (배포 빌드에는 안 들어감)
const ScanDemo = import.meta.env.DEV ? lazy(() => import('./planner/ScanDemo')) : null

export default function App() {
  if (ScanDemo && new URLSearchParams(window.location.search).has('scan-demo')) {
    return <Suspense><ScanDemo /></Suspense>
  }
  return (
    <Routes>
      <Route path="*" element={<PlannerApp />} />
    </Routes>
  )
}
```

- [ ] **Step 5: `PlannerApp.tsx`의 수동 History 동기화 삭제**

157–182줄(주석 `// URL 경로 라우팅 — / (검색), ...`부터 `}, [tab, openId, liveId, done])`까지)을 통째로 삭제. 이 코드는 router가 모르는 `pushState`를 해서 라우터와 주소가 어긋난다. 이제 PlannerApp은 라우팅 이전처럼 주소와 무관하게 동작한다(Task 10에서 삭제될 때까지의 과도기).

- [ ] **Step 6: 검증**

Run: `npx tsc -b && npx vite build && npx oxlint && npx vitest run --passWithNoTests`
Expected: 전부 통과. `npm run dev` 후 `http://localhost:5173/` 접속 → 스플래시 → 홈이 이전과 같이 보임.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/main.tsx src/App.tsx src/planner/PlannerApp.tsx
git commit -m "chore: react-router·vitest 도입, 수동 History 동기화 제거

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 진입 쿼리 해석 (`entry.ts`)

**Files:**
- Create: `frontend/src/entry.ts`
- Test: `frontend/src/entry.test.ts`

**Interfaces:**
- Produces:
  - `type Entry = { kind: 'none' } | { kind: 'login'; token: string } | { kind: 'loginError'; message: string } | { kind: 'youtube'; id: string } | { kind: 'youtubeError'; message: string } | { kind: 'course'; id: string }`
  - `readEntry(search: string): Entry`
  - `saveReturnTo(path: string): void`, `takeReturnTo(): string` (없으면 `'/'`, 읽으면 지움)
  - `const PENDING_KEY = 'nolda:yt-pending'`, `savePending(sources: Sources): void`, `takePending(): Sources | null`

- [ ] **Step 1: 실패하는 테스트 작성** — `src/entry.test.ts`

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { readEntry, saveReturnTo, takeReturnTo, savePending, takePending } from './entry'

afterEach(() => sessionStorage.clear())

describe('readEntry', () => {
  it('쿼리가 없으면 none', () => {
    expect(readEntry('')).toEqual({ kind: 'none' })
  })
  it('카카오·구글 로그인 성공', () => {
    expect(readEntry('?login_token=abc')).toEqual({ kind: 'login', token: 'abc' })
  })
  it('로그인 취소 코드는 한국어 안내로', () => {
    expect(readEntry('?login_error=cancelled')).toEqual({ kind: 'loginError', message: '카카오 로그인을 취소했어요.' })
    expect(readEntry('?login_error=access_denied')).toEqual({ kind: 'loginError', message: '카카오 로그인을 취소했어요.' })
  })
  it('백엔드가 보낸 에러 문장은 그대로', () => {
    expect(readEntry('?login_error=' + encodeURIComponent('토큰 교환 실패'))).toEqual({ kind: 'loginError', message: '토큰 교환 실패' })
  })
  it('유튜브 연동 성공·실패', () => {
    expect(readEntry('?yt=r1')).toEqual({ kind: 'youtube', id: 'r1' })
    expect(readEntry('?yt_error=access_denied')).toEqual({ kind: 'youtubeError', message: '유튜브 연결을 취소했어요' })
    expect(readEntry('?yt_error=boom')).toEqual({ kind: 'youtubeError', message: '유튜브 연결에 실패했어요' })
  })
  it('옛 공유 링크', () => {
    expect(readEntry('?course=c9')).toEqual({ kind: 'course', id: 'c9' })
  })
})

describe('return-to', () => {
  it('저장한 경로를 한 번만 돌려준다', () => {
    saveReturnTo('/saved')
    expect(takeReturnTo()).toBe('/saved')
    expect(takeReturnTo()).toBe('/')
  })
  it('외부 주소는 무시하고 /로', () => {
    saveReturnTo('https://evil.example')
    expect(takeReturnTo()).toBe('/')
    saveReturnTo('//evil.example')
    expect(takeReturnTo()).toBe('/')
  })
})

describe('pending sources', () => {
  it('한 번만 꺼낸다', () => {
    savePending({ youtube: true, photos: true })
    expect(takePending()).toEqual({ youtube: true, photos: true })
    expect(takePending()).toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/entry.test.ts`
Expected: FAIL — `Failed to resolve import "./entry"`

- [ ] **Step 3: 구현** — `src/entry.ts`

```ts
// 앱에 처음 들어올 때 주소 쿼리가 뜻하는 것.
// 백엔드는 소셜 로그인·유튜브 연동이 끝나면 항상 /?... 로 돌려보낸다 (백엔드 main.py)
import type { Sources } from './planner/logic'

export type Entry =
  | { kind: 'none' }
  | { kind: 'login'; token: string }
  | { kind: 'loginError'; message: string }
  | { kind: 'youtube'; id: string }
  | { kind: 'youtubeError'; message: string }
  | { kind: 'course'; id: string }

// 'cancelled'·'access_denied'는 카카오가 주는 짧은 코드, 그 외엔 백엔드가 보낸 실제 에러 문장
const LOGIN_CODES: Record<string, string> = { cancelled: '카카오 로그인을 취소했어요.', access_denied: '카카오 로그인을 취소했어요.' }

export function readEntry(search: string): Entry {
  const q = new URLSearchParams(search)
  const token = q.get('login_token'), loginErr = q.get('login_error')
  const yt = q.get('yt'), ytErr = q.get('yt_error'), course = q.get('course')
  if (token) return { kind: 'login', token }
  if (loginErr) return { kind: 'loginError', message: LOGIN_CODES[loginErr] || loginErr }
  if (yt) return { kind: 'youtube', id: yt }
  if (ytErr) return { kind: 'youtubeError', message: ytErr === 'access_denied' ? '유튜브 연결을 취소했어요' : '유튜브 연결에 실패했어요' }
  if (course) return { kind: 'course', id: course }
  return { kind: 'none' }
}

// 소셜 로그인은 페이지를 통째로 떠났다 돌아온다. 떠나기 전에 돌아올 곳을 적어 둔다
const RETURN_TO_KEY = 'nolda:return-to'

export function saveReturnTo(path: string) {
  try { sessionStorage.setItem(RETURN_TO_KEY, path) } catch { /* 저장 불가 — 홈으로 돌아온다 */ }
}

export function takeReturnTo(): string {
  let p: string | null = null
  try { p = sessionStorage.getItem(RETURN_TO_KEY); sessionStorage.removeItem(RETURN_TO_KEY) } catch { /* 홈으로 */ }
  // 우리 앱 안의 경로만 (//host 같은 외부 주소로 튕기지 않게)
  return p && p.startsWith('/') && !p.startsWith('//') ? p : '/'
}

// 유튜브 연동으로 떠났다 돌아올 때 고른 데이터 소스를 이어가기 위한 임시 저장
const PENDING_KEY = 'nolda:yt-pending'

export function savePending(sources: Sources) {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ sources })) } catch { /* 돌아와서 유튜브만으로 */ }
}

export function takePending(): Sources | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    sessionStorage.removeItem(PENDING_KEY)
    return raw ? (JSON.parse(raw).sources ?? null) : null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/entry.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/entry.ts src/entry.test.ts
git commit -m "feat: 진입 쿼리(로그인·유튜브 복귀, 옛 공유 링크) 해석 함수

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 토스트·로그인 상태 (`state/toast.tsx`, `state/auth.tsx`)

**Files:**
- Create: `frontend/src/state/toast.tsx`
- Create: `frontend/src/state/auth.tsx`
- Test: `frontend/src/state/auth.test.tsx`

**Interfaces:**
- Produces:
  - `ToastProvider`, `useToast(): (msg: string) => void`
  - `AuthProvider`, `useAuth(): Auth`, `RequireAuth({ children })`
  - `interface User { name: string; email: string; avatar?: string | null }`
  - `interface Auth { token: string | null; user: User | null; guest: boolean; signIn(token: string): void; continueAsGuest(): void; updateProfile(nickname: string, avatar?: string): Promise<string | null>; logout(): void }`
  - `export const LAST_PROVIDER_KEY = 'nolda:last-login-provider'`

- [ ] **Step 1: 실패하는 테스트 작성** — `src/state/auth.test.tsx`

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthFailure, fetchMe } from '../planner/api'
import { AuthProvider, RequireAuth, useAuth } from './auth'

vi.mock('../planner/api', async (orig) => ({ ...(await orig<typeof import('../planner/api')>()), fetchMe: vi.fn(), updateMe: vi.fn() }))
const mockMe = vi.mocked(fetchMe)
const TOKEN = 'nolda:login-token'

function Where() {
  const l = useLocation()
  return <div data-testid="where">{l.pathname + l.search}</div>
}
let auth: ReturnType<typeof useAuth>
function Grab() { auth = useAuth(); return null }

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Grab />
        <Routes>
          <Route path="/start" element={<RequireAuth><div>START</div></RequireAuth>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}
const fail = (status?: number) => { const e = new AuthFailure('x'); e.status = status; return e }

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); mockMe.mockReset() })
afterEach(cleanup)

describe('RequireAuth', () => {
  it('토큰이 있으면 서버 응답 전에도 통과 (서버가 자고 있어도 로그인 화면으로 튕기지 않음)', () => {
    localStorage.setItem(TOKEN, 't1')
    mockMe.mockReturnValue(new Promise(() => {}))
    renderAt('/start')
    expect(screen.getByText('START')).toBeTruthy()
  })
  it('서버가 401이면 토큰을 지우고 /login?next=로', async () => {
    localStorage.setItem(TOKEN, 't1')
    mockMe.mockRejectedValue(fail(401))
    renderAt('/start')
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/login?next=%2Fstart'))
    expect(localStorage.getItem(TOKEN)).toBeNull()
  })
  it('네트워크 오류(status 없음)·500이면 토큰 유지', async () => {
    localStorage.setItem(TOKEN, 't1')
    mockMe.mockRejectedValue(fail(500))
    renderAt('/start')
    await act(async () => {})
    expect(screen.getByText('START')).toBeTruthy()
    expect(localStorage.getItem(TOKEN)).toBe('t1')
  })
  it('토큰 없고 게스트도 아니면 /login?next=', () => {
    renderAt('/start')
    expect(screen.getByTestId('where').textContent).toBe('/login?next=%2Fstart')
  })
  it('게스트는 통과', () => {
    sessionStorage.setItem('nolda:guest', '1')
    renderAt('/start')
    expect(screen.getByText('START')).toBeTruthy()
  })
})

describe('signIn / logout', () => {
  it('signIn은 토큰을 저장하고 user를 채운다', async () => {
    mockMe.mockResolvedValue({ id: '1', provider: 'kakao', email: null, nickname: '수빈', avatar_url: null })
    renderAt('/home')
    act(() => auth.signIn('fresh'))
    await waitFor(() => expect(auth.user?.name).toBe('수빈'))
    expect(localStorage.getItem(TOKEN)).toBe('fresh')
    expect(localStorage.getItem('nolda:last-login-provider')).toBe('kakao')
  })
  it('막 받은 토큰이 거부되면 /login?error=로 안내', async () => {
    mockMe.mockRejectedValue(fail(500))
    renderAt('/home')
    act(() => auth.signIn('fresh'))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toMatch(/^\/login\?error=/))
  })
  it('logout만 토큰을 지운다', () => {
    localStorage.setItem(TOKEN, 't1')
    mockMe.mockReturnValue(new Promise(() => {}))
    renderAt('/home')
    act(() => auth.logout())
    expect(localStorage.getItem(TOKEN)).toBeNull()
    expect(auth.token).toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/state/auth.test.tsx`
Expected: FAIL — `Failed to resolve import "./auth"`

- [ ] **Step 3: `src/state/toast.tsx` 작성**

```tsx
// 화면 아래 잠깐 뜨는 안내 문구 — 앱 전체에 하나
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

const Ctx = createContext<(msg: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('')
  const timer = useRef<number | null>(null)
  const show = useCallback((m: string) => {
    setMsg(m)
    if (timer.current) clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(''), 2200)
  }, [])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  return (
    <Ctx.Provider value={show}>
      {children}
      {msg && <div className="pl-toast" role="status">{msg}</div>}
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
```

- [ ] **Step 4: `src/state/auth.tsx` 작성**

```tsx
// 로그인 상태 — 화면 흐름과 분리. 토큰을 지우는 곳은 clear() 하나뿐이다.
// (예전엔 화면 '뒤로' 버튼이 부르던 함수가 토큰까지 지워서 조용히 로그아웃됐다)
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { fetchMe, updateMe } from '../planner/api'
import type { AuthFailure, AuthUser } from '../planner/api'

const LOGIN_TOKEN_KEY = 'nolda:login-token'
// 로그인 성공 때마다 갱신 — 토큰이 만료돼 다시 로그인할 때 "마지막으로 OO로 로그인했어요" 안내에 씀
export const LAST_PROVIDER_KEY = 'nolda:last-login-provider'
const GUEST_KEY = 'nolda:guest' // '로그인 없이 둘러보기' — 이 탭을 닫으면 끝

export interface User { name: string; email: string; avatar?: string | null }
export interface Auth {
  token: string | null
  user: User | null
  guest: boolean
  signIn: (token: string) => void
  continueAsGuest: () => void
  /** 이름·사진 저장 — 실패하면 안내 문구, 성공하면 null */
  updateProfile: (nickname: string, avatar?: string) => Promise<string | null>
  logout: () => void
}

const Ctx = createContext<Auth | null>(null)
const get = (s: Storage, k: string) => { try { return s.getItem(k) } catch { return null } }
const toUser = (me: AuthUser): User => ({ name: me.nickname || '게스트', email: me.email || '', avatar: me.avatar_url })

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [token, setToken] = useState(() => get(localStorage, LOGIN_TOKEN_KEY))
  const [user, setUser] = useState<User | null>(null)
  const [guest, setGuest] = useState(() => get(sessionStorage, GUEST_KEY) === '1')
  const fresh = useRef(false) // 방금 소셜 로그인에서 받은 토큰인지

  const clear = useCallback(() => {
    try { localStorage.removeItem(LOGIN_TOKEN_KEY); sessionStorage.removeItem(GUEST_KEY) } catch { /* 상태만 비움 */ }
    setToken(null); setUser(null); setGuest(false)
  }, [])

  // 저장된 토큰이 아직 유효한지 확인. 확인 전에도 로그인한 사람으로 본다
  // (무료 플랜 서버는 15분 뒤 잠들어 깨는 데 30초가 넘는다)
  useEffect(() => {
    if (!token) return
    let alive = true
    fetchMe(token)
      .then((me) => {
        if (!alive) return
        fresh.current = false
        try { localStorage.setItem(LAST_PROVIDER_KEY, me.provider) } catch { /* 안내용이라 없어도 됨 */ }
        setUser(toUser(me))
      })
      .catch((e: AuthFailure) => {
        if (!alive) return
        const dead = e.status === 401 || e.status === 403 || e.status === 404
        // 서버가 꺼져 있거나 네트워크가 끊긴 것뿐이면 지우지 않는다 — 멀쩡한 로그인이 날아간다
        if (dead || fresh.current) clear()
        if (fresh.current) {
          fresh.current = false
          navigate('/login?error=' + encodeURIComponent('로그인 확인에 실패했어요. 다시 시도해 주세요.'), { replace: true })
        }
      })
    return () => { alive = false }
  }, [token, clear, navigate])

  const value = useMemo<Auth>(() => ({
    token, user, guest,
    signIn: (t) => {
      fresh.current = true
      try { localStorage.setItem(LOGIN_TOKEN_KEY, t) } catch { /* 이번 탭에서만 유지 */ }
      setToken(t)
    },
    continueAsGuest: () => {
      try { sessionStorage.setItem(GUEST_KEY, '1') } catch { /* 이번 화면에서만 */ }
      setGuest(true)
    },
    updateProfile: async (nickname, avatar) => {
      if (!token) return '로그인이 필요해요'
      try { setUser(toUser(await updateMe(token, nickname, avatar))); return null } catch (e) { return (e as Error).message }
    },
    logout: clear,
  }), [token, user, guest, clear])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): Auth {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth는 AuthProvider 안에서만')
  return v
}

/** 로그인(또는 게스트)이 필요한 화면. 아니면 로그인 화면으로 보내고, 끝나면 여기로 돌아온다 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { token, guest } = useAuth()
  const loc = useLocation()
  if (token || guest) return children
  return <Navigate to={'/login?next=' + encodeURIComponent(loc.pathname + loc.search)} replace />
}
```

주의: 토큰 확인 effect는 `[token]`이 바뀔 때만 다시 돈다. StrictMode에서 두 번 돌아도 `alive` 가드로 앞의 결과를 버리므로 `fetchMe`가 두 번 불릴 뿐 상태는 한 번만 바뀐다.

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/state/auth.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 6: 전체 검증 후 Commit**

Run: `npx tsc -b && npx vite build && npx oxlint && npx vitest run`

```bash
git add src/state/toast.tsx src/state/auth.tsx src/state/auth.test.tsx
git commit -m "feat: 로그인 상태를 AuthContext로 분리 — 토큰 삭제는 logout 한 곳만

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 코스 저장소·분석 결과 (`state/courses.tsx`, `state/analysis.tsx`)

**Files:**
- Create: `frontend/src/state/courses.tsx`
- Create: `frontend/src/state/analysis.tsx`
- Test: `frontend/src/state/analysis.test.tsx`

**Interfaces:**
- Consumes: `useToast()`, `useAuth().token` (Task 3)
- Produces:
  - `CoursesProvider`, `useCourses(): { pool: Record<string, Course>; saved: string[]; savedCourses: Course[]; booked: string[]; addCourses(list: Course[]): void; toggleSave(id: string): void; toggleBook(key: string): void }`
  - `AnalysisProvider`, `useAnalysis(): Analysis` — 아래 코드의 `Analysis` 인터페이스 그대로
  - `interface AiState { status: 'idle' | 'loading' | 'done' | 'error'; ids: string[]; error: string }`
  - `useBuilt(): { builtAll: BuiltCourse[]; list: BuiltCourse[]; getBuilt(id: string): BuiltCourse | null }`
  - `RequireReport({ children })` — 분석 결과 없으면 `/start`
  - `HOUR_DEFAULT: Record<string, [number, number]>`, `hourBucket(h: number): string`

- [ ] **Step 1: 실패하는 테스트 작성** — `src/state/analysis.test.tsx`

```tsx
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ToastProvider } from './toast'
import { AuthProvider } from './auth'
import { CoursesProvider } from './courses'
import { AnalysisProvider, RequireReport, useAnalysis } from './analysis'
import type { Report } from '../planner/logic'

const KEY = 'nolda:analysis'
const REPORT = { repeatSpots: [], party: 2, budgetBand: 30000, taste: { mood: 'calm' }, tags: ['카페'], evidence: {}, highlights: [], topics: [], total: 0, ytLikes: 0, ytSubs: 0, notice: '' } as unknown as Report

let a: ReturnType<typeof useAnalysis>
function Grab() { a = useAnalysis(); return null }
function Where() { return <div data-testid="where">{useLocation().pathname}</div> }

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider><AuthProvider><CoursesProvider><AnalysisProvider>
        <Grab />
        <Routes>
          <Route path="/summary" element={<RequireReport><div>SUMMARY</div></RequireReport>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </AnalysisProvider></CoursesProvider></AuthProvider></ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear() })
afterEach(cleanup)

describe('분석 결과 보관', () => {
  it('결과 없이 /summary면 /start로', () => {
    renderAt('/summary')
    expect(screen.getByTestId('where').textContent).toBe('/start')
  })
  it('sessionStorage에 결과가 있으면 새로고침해도 /summary 유지', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ report: REPORT }))
    renderAt('/summary')
    expect(screen.getByText('SUMMARY')).toBeTruthy()
  })
  it('setResult는 sessionStorage에 남는다', () => {
    renderAt('/x')
    act(() => a.setResult(REPORT))
    expect(JSON.parse(sessionStorage.getItem(KEY)!).report.tags).toEqual(['카페'])
    expect(a.cond.people).toBe(2)
    expect(a.cond.budget).toBe(30000)
  })
  it('loading 상태로 저장됐으면 idle로 되살린다 (다시 생성하게)', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ report: REPORT, ai: { status: 'loading', ids: [], error: '' } }))
    renderAt('/x')
    expect(a.ai.status).toBe('idle')
  })
  it('깨진 JSON이면 빈 상태로 시작', () => {
    sessionStorage.setItem(KEY, '{not json')
    renderAt('/x')
    expect(a.report).toBeNull()
  })
  it('restart는 결과를 비우지만 로그인 토큰은 건드리지 않는다', () => {
    localStorage.setItem('nolda:login-token', 't1')
    sessionStorage.setItem(KEY, JSON.stringify({ report: REPORT }))
    renderAt('/x')
    act(() => a.restart())
    expect(a.report).toBeNull()
    expect(localStorage.getItem('nolda:login-token')).toBe('t1')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/state/analysis.test.tsx`
Expected: FAIL — `Failed to resolve import "./courses"`

- [ ] **Step 3: `src/state/courses.tsx` 작성** (PlannerApp 109–113, 140–142, 189–210, 514–525줄의 로직)

```tsx
// 받은 코스 원본(aiPool)·저장한 코스·예약 요청 — 화면과 무관하게 앱 전체가 공유
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { COURSES } from '../planner/data'
import type { Course } from '../planner/data'
import { deleteSavedCourse, fetchSavedCourses, putSavedCourse } from '../planner/api'
import { useAuth } from './auth'
import { useToast } from './toast'

const SAVED_KEY = 'nolda:saved-courses' // 저장한 코스(Course 전체) — 새로고침·로그인 없이도 유지
const POOL_KEY = 'nolda:ai-pool' // 이번 탭에서 받은 AI 코스 — 새로고침해도 목록·상세가 유지되게

interface Courses {
  pool: Record<string, Course>
  saved: string[]
  savedCourses: Course[]
  booked: string[]
  addCourses: (list: Course[]) => void
  toggleSave: (id: string) => void
  toggleBook: (key: string) => void
}

const Ctx = createContext<Courses | null>(null)
const readJson = <T,>(s: Storage, k: string, fallback: T): T => {
  try { return (JSON.parse(s.getItem(k) || 'null') as T) ?? fallback } catch { return fallback }
}
const byId = (list: Course[]) => Object.fromEntries(list.map((c) => [c.id, c]))

export function CoursesProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const toast = useToast()
  const [savedInit] = useState(() => readJson<Course[]>(localStorage, SAVED_KEY, []))
  const [pool, setPool] = useState<Record<string, Course>>(() => ({ ...readJson(sessionStorage, POOL_KEY, {}), ...byId(savedInit) }))
  const [saved, setSaved] = useState<string[]>(() => savedInit.map((c) => c.id))
  const [booked, setBooked] = useState<string[]>([])

  const savedCourses = useMemo(
    () => saved.map((id) => pool[id] || COURSES.find((c) => c.id === id)).filter(Boolean) as Course[],
    [saved, pool],
  )
  useEffect(() => {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(savedCourses)) } catch { /* 저장 공간 없음 — 이번 세션만 */ }
  }, [savedCourses])
  useEffect(() => {
    try { sessionStorage.setItem(POOL_KEY, JSON.stringify(pool)) } catch { /* 이번 화면만 */ }
  }, [pool])

  // 로그인하면 DB에 저장해 둔 코스를 가져와 합침
  useEffect(() => {
    if (!token) return
    fetchSavedCourses(token)
      .then((list) => {
        setPool((p) => ({ ...p, ...byId(list) }))
        setSaved((s) => [...s, ...list.map((c) => c.id).filter((id) => !s.includes(id))])
      })
      .catch((e: Error) => console.error('[saved]', e.message))
  }, [token])

  const value: Courses = {
    pool, saved, savedCourses, booked,
    addCourses: (list) => setPool((p) => ({ ...p, ...byId(list) })),
    toggleSave: (id) => {
      const on = !saved.includes(id)
      setSaved((s) => (on ? s.concat([id]) : s.filter((x) => x !== id)))
      toast(on ? '저장한 코스에 담았어요' : '저장을 취소했어요')
      if (token && pool[id]?.shareable) {
        (on ? putSavedCourse(token, id) : deleteSavedCourse(token, id))
          .catch((e: Error) => console.error('[saved]', e.message)) // 서버 저장이 안 돼도 이 기기엔 남아 있음
      }
    },
    toggleBook: (key) => setBooked((b) => (b.includes(key) ? b.filter((x) => x !== key) : b.concat([key]))),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCourses(): Courses {
  const v = useContext(Ctx)
  if (!v) throw new Error('useCourses는 CoursesProvider 안에서만')
  return v
}
```

- [ ] **Step 4: `src/state/analysis.tsx` 작성** (PlannerApp 92–106, 136–141, 419–466, 471–483, 497–511줄의 로직)

```tsx
// 취향 분석 결과와 코스 조건 — 이 탭을 닫기 전까지 새로고침해도 유지(sessionStorage)
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { fetchAiCourses } from '../planner/api'
import { COURSES, DEFAULT_COND } from '../planner/data'
import type { Cond } from '../planner/data'
import { applyPicks, build } from '../planner/logic'
import type { BuiltCourse, Picks, Report, Sources, Taste } from '../planner/logic'
import type { Swipe } from '../planner/tasteType'
import { useCourses } from './courses'

export interface AiState { status: 'idle' | 'loading' | 'done' | 'error'; ids: string[]; error: string }
const AI_IDLE: AiState = { status: 'idle', ids: [], error: '' }

/* 시간대 막대 기본값 — 시작 시각의 4구간(아침·낮·노을 무렵·밤) */
export const HOUR_DEFAULT: Record<string, [number, number]> = { morning: [9, 11], noon: [12, 15], sunset: [16, 19], night: [19, 22] }
export const hourBucket = (h: number) => (h < 11 ? 'morning' : h < 16 ? 'noon' : h < 19 ? 'sunset' : 'night') // logic.ts analyze 기준과 같음

interface Saved {
  report: Report | null
  skipped: boolean // '연결 없이 둘러보기' — 기본 취향으로 코스를 만든다
  taste: Taste
  tags: string[]
  picks: Picks // 동적 주제에서 고른 답 (주제 key → 옵션 값들)
  intent: string | null
  hourRange: [number, number] | null // 안 건드렸으면 시간대 구간 기본값
  swipes: Swipe[] // 분석 중 미니 게임에서 고른 장소
  cond: Cond
  ai: AiState
}
const EMPTY: Saved = { report: null, skipped: false, taste: {}, tags: [], picks: {}, intent: null, hourRange: null, swipes: [], cond: { ...DEFAULT_COND }, ai: AI_IDLE }
const KEY = 'nolda:analysis'
const YT_ID_KEY = 'nolda:yt-id' // 유튜브 집계 결과 id — 한 번 연동하면 로그아웃 전까지 구글을 다시 거치지 않는다

function load(): Saved {
  try {
    const p = JSON.parse(sessionStorage.getItem(KEY) || 'null')
    if (!p || typeof p !== 'object') return EMPTY
    // 생성 중에 새로고침했으면 요청은 이미 끊겼다 — 다시 만들게 idle로
    return { ...EMPTY, ...p, ai: p.ai && p.ai.status !== 'loading' ? p.ai : AI_IDLE }
  } catch {
    return EMPTY
  }
}

export interface Analysis extends Saved {
  patch: (o: Partial<Saved>) => void
  hasResult: boolean
  range: [number, number]
  setHourRange: (r: [number, number]) => void
  effTaste: Taste
  effTags: string[]
  setResult: (r: Report) => void
  skip: () => void
  finish: () => void
  restart: () => void
  generateAi: () => void
  // 아래는 저장하지 않는다 (File은 직렬화 불가, 오류 문구는 일시적)
  sources: Sources
  setSources: (fn: (s: Sources) => Sources) => void
  photoFiles: File[]
  setPhotoFiles: (f: File[]) => void
  scanError: string
  setScanError: (m: string) => void
  ytId: string | null
  setYtId: (id: string | null) => void
}

const Ctx = createContext<Analysis | null>(null)

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const courses = useCourses()
  const [st, setSt] = useState<Saved>(load)
  const patch = (o: Partial<Saved>) => setSt((s) => ({ ...s, ...o }))
  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify(st)) } catch { /* 이번 화면만 */ }
  }, [st])

  const [sources, setSourcesState] = useState<Sources>({ youtube: true, photos: false })
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [scanError, setScanError] = useState('')
  const [ytId, setYtIdState] = useState<string | null>(() => { try { return localStorage.getItem(YT_ID_KEY) } catch { return null } })
  const setYtId = (id: string | null) => {
    setYtIdState(id)
    try { id ? localStorage.setItem(YT_ID_KEY, id) : localStorage.removeItem(YT_ID_KEY) } catch { /* 이번 세션만 */ }
  }

  const range: [number, number] = st.hourRange ?? HOUR_DEFAULT[st.taste.hour || 'noon'] ?? [12, 15]
  // 동적 주제에서 고른 답 → 코스 점수·프롬프트에 쓸 값 (고른 게 없으면 분석값 그대로)
  const derived = useMemo(() => applyPicks(st.report?.topics || [], st.picks, st.tags), [st.report, st.picks, st.tags])
  // useMemo 필수 — 매 렌더 새 객체면 builtAll이 계속 재계산돼 코스 시작 지도가 다시 그려진다
  const effTaste: Taste = useMemo(
    () => ({ ...st.taste, mood: derived.mood ?? st.taste.mood, spend: derived.spend ?? st.taste.spend }),
    [st.taste, derived.mood, derived.spend],
  )
  const swipePicked = useMemo(() => {
    const liked = st.swipes.filter((x) => x.liked), nope = st.swipes.filter((x) => !x.liked)
    const label = (x: Swipe) => `${x.name}(${x.kind})`
    return [
      ...(liked.length ? [{ name: '분석 중 마음에 든 장소', labels: liked.map(label), hint: '이 장소들과 종류·분위기가 비슷한 곳을 우선한다' }] : []),
      ...(nope.length ? [{ name: '분석 중 별로라고 한 장소', labels: nope.map(label), hint: '이 장소들과 비슷한 곳은 되도록 피한다' }] : []),
    ]
  }, [st.swipes])

  const aiAbort = useRef<AbortController | null>(null)
  useEffect(() => () => aiAbort.current?.abort(), [])
  const generateAi = () => {
    aiAbort.current?.abort()
    const ctrl = new AbortController()
    aiAbort.current = ctrl
    setSt((s) => ({ ...s, ai: { ...s.ai, status: 'loading', error: '' } }))
    fetchAiCourses(
      { taste: effTaste, tags: derived.tags, intent: st.intent, picked: [...derived.picked, ...swipePicked], cond: st.cond, time_window: { start: range[0], end: range[1] } },
      ctrl.signal,
    )
      .then((list) => {
        courses.addCourses(list)
        patch({ ai: { status: 'done', ids: list.map((c) => c.id), error: '' } })
      })
      .catch((e: Error) => {
        if (!ctrl.signal.aborted) setSt((s) => ({ ...s, ai: { ...s.ai, status: 'error', error: e.message } }))
      })
  }

  const value: Analysis = {
    ...st, patch, range, effTaste, effTags: derived.tags,
    hasResult: !!st.report || st.skipped,
    setHourRange: (r) => setSt((s) => ({ ...s, hourRange: r, taste: { ...s.taste, hour: hourBucket(r[0]) } })),
    setResult: (r) => setSt((s) => ({
      ...s, report: r, skipped: false, taste: r.taste, tags: r.tags, picks: {}, ai: AI_IDLE,
      cond: { ...s.cond, people: r.party, budget: r.budgetBand },
    })),
    skip: () => setSt((s) => ({ ...s, report: null, skipped: true, taste: { mood: 'calm', crowd: 'mid', hour: 'noon', spend: 'cafe', pace: 'mid' }, tags: [], ai: AI_IDLE })),
    // 혼자·연인이면 인원 조건도 맞춤 (친구·가족·동료는 인원이 제각각이라 그대로)
    finish: () => {
      const people = st.taste.companion === 'solo' ? 1 : st.taste.companion === 'couple' ? 2 : 0
      if (people) setSt((s) => ({ ...s, cond: { ...s.cond, people } }))
    },
    // 분석을 처음부터 — 로그인·유튜브 연동은 건드리지 않는다
    restart: () => { aiAbort.current?.abort(); setSt(EMPTY); setScanError('') },
    generateAi,
    sources, setSources: (fn) => setSourcesState(fn), photoFiles, setPhotoFiles, scanError, setScanError, ytId, setYtId,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAnalysis(): Analysis {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAnalysis는 AnalysisProvider 안에서만')
  return v
}

/** 취향을 반영해 계산한 코스들. list = 지금 목록에 보일 것 */
export function useBuilt() {
  const a = useAnalysis()
  const c = useCourses()
  const builtAll: BuiltCourse[] = useMemo(
    () => [...Object.values(c.pool), ...COURSES].map((x) => build(x, { taste: a.effTaste, tags: a.effTags, intent: a.intent, people: a.cond.people, booked: c.booked })),
    [c.pool, a.effTaste, a.effTags, a.intent, a.cond.people, c.booked],
  )
  const list = useMemo(() => {
    const fixed = new Set(COURSES.map((x) => x.id))
    // 분석 전이거나 AI가 실패했으면 고정 코스로 (화면이 텅 비지 않게)
    if (!a.hasResult || a.ai.status === 'error') return builtAll.filter((x) => fixed.has(x.id))
    return a.ai.ids.map((id) => builtAll.find((x) => x.id === id)).filter(Boolean) as BuiltCourse[]
  }, [builtAll, a.hasResult, a.ai.status, a.ai.ids])
  const getBuilt = (id: string) => builtAll.find((x) => x.id === id) || null
  return { builtAll, list, getBuilt }
}

/** 분석 결과가 있어야 보이는 화면 — 없으면 데이터 고르기로 */
export function RequireReport({ children }: { children: ReactNode }) {
  return useAnalysis().report ? children : <Navigate to="/start" replace />
}
```

`Report`에 `taste`·`tags`·`party`·`budgetBand`·`topics` 필드가 있는지 `planner/logic.ts` 22줄 `interface Report`에서 확인. `Taste`에 `companion`이 없으면 `tsc`가 실패한다 → 기존 PlannerApp 651줄이 `taste.companion`을 쓰고 있으므로 있음.

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/state/analysis.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 6: 전체 검증 후 Commit**

Run: `npx tsc -b && npx vite build && npx oxlint && npx vitest run`

```bash
git add src/state/courses.tsx src/state/analysis.tsx src/state/analysis.test.tsx
git commit -m "feat: 코스 저장소·분석 결과 Context — 분석 결과는 sessionStorage에 보관

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 분석 진행 엔진 (`state/scan.tsx`)

**Files:**
- Create: `frontend/src/state/scan.tsx`
- Test: `frontend/src/state/scan.test.tsx`

**Interfaces:**
- Consumes: `useAnalysis()` (`sources`, `photoFiles`, `ytId`, `setYtId`, `setScanError`, `setResult`, `patch`) — Task 4; `savePending()` — Task 2
- Produces:
  - `ScanProvider`, `useScan(): Scan`
  - `interface ScanResult { tags: string[]; taste: Taste }`
  - `interface Scan { active: boolean; src: Sources; yt: YoutubeTaste | null; scanN: number; ytLoading: boolean; ready: ScanResult | null; photoUrls: string[]; start(src: Sources, files: File[], ytId: string | null, opts?: { replace?: boolean }): void; cancel(): void; reveal(): void }`
  - `export const SCAN_STEP_MS = 280, SCAN_INTAKE_MS = 1300, SCENE_LAUNCH_MS = 700`

- [ ] **Step 1: 실패하는 테스트 작성** — `src/state/scan.test.tsx`

```tsx
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { analyzeTaste } from '../planner/api'
import { ToastProvider } from './toast'
import { AuthProvider } from './auth'
import { CoursesProvider } from './courses'
import { AnalysisProvider, useAnalysis } from './analysis'
import { ScanProvider, useScan } from './scan'

vi.mock('../planner/api', async (orig) => ({ ...(await orig<typeof import('../planner/api')>()), analyzeTaste: vi.fn(), fetchMe: vi.fn(() => new Promise(() => {})) }))
// 사진 1장을 읽은 것으로 — 그래야 analyzeTaste가 불린다
vi.mock('../planner/photoMeta', async (orig) => ({ ...(await orig<typeof import('../planner/photoMeta')>()), readPhotos: vi.fn(async () => [{}] as never) }))
const mockAnalyze = vi.mocked(analyzeTaste)

let s: ReturnType<typeof useScan>, a: ReturnType<typeof useAnalysis>
function Grab() { s = useScan(); a = useAnalysis(); return null }
function Where() { return <div data-testid="where">{useLocation().pathname}</div> }

beforeAll(() => {
  // jsdom에는 matchMedia가 없다 — '움직임 줄이기'로 두면 최소 노출 대기도 건너뛴다
  window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
})
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); mockAnalyze.mockReset() })
afterEach(cleanup)

function renderApp() {
  render(
    <MemoryRouter initialEntries={['/start']}>
      <ToastProvider><AuthProvider><CoursesProvider><AnalysisProvider><ScanProvider>
        <Grab />
        <Routes><Route path="*" element={<Where />} /></Routes>
      </ScanProvider></AnalysisProvider></CoursesProvider></AuthProvider></ToastProvider>
    </MemoryRouter>,
  )
}

const photo = new File(['x'], 'a.jpg', { type: 'image/jpeg' })

describe('ScanProvider', () => {
  it('사진만으로 분석: /scan으로 가고, 결과 보기를 누르면 /summary', async () => {
    mockAnalyze.mockResolvedValue(null as never) // LLM 실패 → 폴백 결과
    renderApp()
    act(() => s.start({ youtube: false, photos: true }, [photo], null))
    expect(screen.getByTestId('where').textContent).toBe('/scan')
    await waitFor(() => expect(s.ready).not.toBeNull(), { timeout: 3000 })
    act(() => s.reveal())
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/summary'))
    expect(a.report).not.toBeNull()
  })
  it('cancel 후 늦게 끝난 분석은 화면을 넘기지 못한다', async () => {
    let resolve: ((v: null) => void) | undefined
    mockAnalyze.mockReturnValue(new Promise((r) => { resolve = r }) as never)
    renderApp()
    act(() => s.start({ youtube: false, photos: true }, [photo], null))
    act(() => s.cancel())
    await waitFor(() => expect(resolve).toBeDefined()) // readPhotos 다음에 analyzeTaste가 불린다
    await act(async () => { resolve!(null) })
    await new Promise((r) => setTimeout(r, 600))
    expect(s.ready).toBeNull()
    expect(a.report).toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/state/scan.test.tsx`
Expected: FAIL — `Failed to resolve import "./scan"`

- [ ] **Step 3: `src/state/scan.tsx` 작성** (PlannerApp 246–345, 410–418줄 로직을 옮김)

```tsx
// 분석 진행 — 기록 읽기 진행률 타이머 + 백엔드 LLM 분석을 함께 돌리고, 둘 다 끝나면 결과를 발표한다.
// 시작은 버튼 핸들러·진입 처리에서 start()로 부른다 (페이지 마운트 effect로 시작하면 StrictMode에서 두 번 돈다)
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyzeTaste, fetchYoutubeTaste, youtubeAuthorizeUrl } from '../planner/api'
import type { TasteProfile, YoutubeTaste } from '../planner/api'
import { analyzeYoutubeOnly, reportFromProfile, scanSteps } from '../planner/logic'
import type { Sources, Taste } from '../planner/logic'
import { readPhotos } from '../planner/photoMeta'
import { stashPhotos } from '../planner/photoStash'
import { savePending } from '../entry'
import { useAnalysis } from './analysis'

export const SCAN_STEP_MS = 280 // 기록 하나를 읽는 간격 (진행률)
export const SCAN_INTAKE_MS = 1300 // 분석 중 화면을 최소한 보여주는 시간
export const SCENE_LAUNCH_MS = 700 // '취향 분석 시작'을 누른 뒤 카드가 모이는 장면 길이 (planner.css sg-fan.is-launch)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface ScanResult { tags: string[]; taste: Taste }
export interface Scan {
  active: boolean
  src: Sources
  yt: YoutubeTaste | null
  scanN: number
  ytLoading: boolean
  ready: ScanResult | null
  photoUrls: string[]
  start: (src: Sources, files: File[], ytId: string | null, opts?: { replace?: boolean }) => void
  cancel: () => void
  /** '결과 보기' — 요약 화면으로 */
  reveal: () => void
}

const Ctx = createContext<Scan | null>(null)

export function ScanProvider({ children }: { children: ReactNode }) {
  const a = useAnalysis()
  const navigate = useNavigate()
  const [active, setActive] = useState(false)
  const [scanN, setScanN] = useState(0)
  const [ytLoading, setYtLoading] = useState(false)
  const [ready, setReady] = useState<ScanResult | null>(null)
  const [files, setFiles] = useState<File[]>([])
  // 타이머 콜백이 옛 state를 보지 않도록 이번 분석 값은 ref로
  const run = useRef<{ src: Sources; yt: YoutubeTaste | null }>({ src: { youtube: false, photos: false }, yt: null })
  const profile = useRef<Promise<TasteProfile | null> | null>(null)
  const timer = useRef<number | null>(null)
  const t0 = useRef(0)
  const finished = useRef(false)
  const token = useRef(0) // 취소·재시작하면 바뀜 — 늦게 끝난 이전 분석이 화면을 넘기지 못하게
  const go = useRef<(() => void) | null>(null)

  const photoUrls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => { photoUrls.forEach((u) => URL.revokeObjectURL(u)) }, [photoUrls])
  const stopTimer = () => { if (timer.current) clearInterval(timer.current); timer.current = null }
  useEffect(() => stopTimer, [])

  const finish = async () => {
    if (finished.current) return
    finished.current = true
    stopTimer()
    const mine = token.current
    const still = () => mine === token.current
    const motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const [prof] = await Promise.all([profile.current, motion ? sleep(SCAN_INTAKE_MS) : null]) // 빨리 끝나도 잠깐은 보여줌
    if (!still()) return
    // LLM 분석이 실패하면 유튜브 키워드 규칙만으로 (사진은 흉내 내지 않는다 — 가짜 결과가 되므로)
    const r = prof
      ? reportFromProfile(prof)
      : analyzeYoutubeOnly(run.current.yt, run.current.yt ? '취향 분석에 실패해 유튜브 기록만으로 대략 맞췄어요' : '취향 분석에 실패해 기본값으로 맞췄어요')
    setReady({ tags: r.tags, taste: r.taste })
    await new Promise<void>((res) => { go.current = res })
    go.current = null
    if (!still()) return
    a.setResult(r)
    setActive(false); setReady(null)
    navigate('/summary', { replace: true })
  }

  /** 사진을 읽어(EXIF·축소) 유튜브 집계와 함께 백엔드로 — 실패하면 null이라 폴백으로 */
  const startProfile = (src: Sources, ytId: string | null, fs: File[]) => {
    profile.current = (src.photos && fs.length ? readPhotos(fs) : Promise.resolve([]))
      .then((photos) => (photos.length || ytId ? analyzeTaste({ yt_id: ytId, photos }) : null))
      .catch((e: Error) => { a.setScanError(e.message); return null })
  }

  const runScan = (src: Sources, yt: YoutubeTaste | null, photoCount: number) => {
    run.current = { src, yt }
    finished.current = false
    setScanN(0)
    stopTimer()
    const total = scanSteps(src, yt, photoCount)
    if (!total) { void finish(); return }
    t0.current = Date.now()
    timer.current = window.setInterval(() => {
      setScanN((n) => {
        const next = Math.max(n + 1, Math.min(total, Math.floor((Date.now() - t0.current) / SCAN_STEP_MS)))
        if (next >= total) { stopTimer(); void finish() }
        return next
      })
    }, SCAN_STEP_MS)
  }

  const start: Scan['start'] = (src, fs, ytId, opts) => {
    if (!src.youtube && !src.photos) return
    a.setScanError('')
    // 처음 연동이면 구글로 떠난다 → 백엔드가 집계 후 /?yt=<id>로 돌려보냄 (EntryHandler가 이어서 start)
    if (src.youtube && !ytId) {
      try {
        const url = youtubeAuthorizeUrl()
        savePending(src)
        // 고른 사진은 기기 안(IndexedDB)에 보관했다가 돌아와서 복원
        void (src.photos ? stashPhotos(fs) : Promise.resolve()).then(() => { window.location.href = url })
      } catch (e) {
        a.setScanError((e as Error).message)
      }
      return
    }
    token.current++
    setActive(true); setReady(null); setFiles(fs)
    a.patch({ swipes: [] })
    run.current = { src, yt: null }
    navigate('/scan', { replace: opts?.replace })
    if (!src.youtube) { startProfile(src, null, fs); runScan(src, null, fs.length); return }
    const mine = token.current
    setYtLoading(true)
    fetchYoutubeTaste(ytId!)
      .then((data) => { if (mine !== token.current) return; startProfile(src, ytId, fs); runScan(src, data, fs.length) })
      .catch(() => {
        if (mine !== token.current) return
        a.setYtId(null); a.setScanError('유튜브 연동이 만료됐어요. 다시 연결해 주세요')
        setActive(false); navigate('/start', { replace: true })
      })
      .finally(() => setYtLoading(false))
  }

  const cancel = () => {
    stopTimer()
    token.current++
    go.current = null
    setActive(false); setReady(null); setScanN(0)
  }

  // 다른 앱에 갔다 오면 타이머가 멈춰 있을 수 있다 — 돌아오면 바로 마무리
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && active && !ytLoading && timer.current) void finish()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  })

  const value: Scan = { active, src: run.current.src, yt: run.current.yt, scanN, ytLoading, ready, photoUrls, start, cancel, reveal: () => go.current?.() }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useScan(): Scan {
  const v = useContext(Ctx)
  if (!v) throw new Error('useScan은 ScanProvider 안에서만')
  return v
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/state/scan.test.tsx`
Expected: PASS (2 tests). 첫 테스트가 타임아웃이면 `scanSteps({youtube:false,photos:true}, null, 1)` 값을 확인 — 단계 수 × 280ms가 3초를 넘으면 `waitFor` timeout을 그만큼 늘린다.

- [ ] **Step 5: 전체 검증 후 Commit**

Run: `npx tsc -b && npx vite build && npx oxlint && npx vitest run`

```bash
git add src/state/scan.tsx src/state/scan.test.tsx
git commit -m "feat: 분석 진행 엔진을 ScanProvider로 분리 — 취소한 분석은 결과를 내지 못함

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 코스 목록·상세 모달·실시간 진행 페이지

**Files:**
- Create: `frontend/src/components/CourseModal.tsx`
- Create: `frontend/src/pages/TabLayout.tsx`
- Create: `frontend/src/pages/CoursesPage.tsx`
- Create: `frontend/src/pages/CourseModalRoute.tsx`
- Create: `frontend/src/pages/LivePage.tsx`
- Create: `frontend/src/pages/CourseModalRoute.test.tsx`
- Modify: `frontend/src/main.tsx` (Provider 감싸기)
- Modify: `frontend/src/App.tsx` (라우트 추가)

**Interfaces:**
- Consumes: `useBuilt`, `useAnalysis`, `useCourses`, `useToast`
- Produces:
  - `CourseModal` props 그대로: `{ course: BuiltCourse; isSaved: boolean; booked: string[]; toggleBook(key): void; toggleSave(): void; start(): void; share(): void; close(): void; closing: boolean }`
  - `openCourseState(location)` 없이, 목록에서 열 때는 항상 `navigate('/course/' + id, { state: { background: location } })`
  - `TabLayout` — `<Outlet />` + `BottomTabs`, 경로→탭: `/`→home, `/search`→search, `/saved`→saved, `/my`→my, `/courses`·`/course/*`→course

- [ ] **Step 1: `components/CourseModal.tsx` 작성**

파일 머리:

```tsx
// 코스 상세 모달 (타임라인 + 이동 동선) — 코스 목록·저장·홈 어디서 열어도 같은 모달
import { useEffect, useMemo, useState } from 'react'
import NaverMap from '../planner/NaverMap'
import KindThumb from '../planner/KindThumb'
import PlacePreview from '../planner/PlacePreview'
import { placeGeo } from '../planner/geo'
import { useWalkLegs } from '../planner/useWalkLegs'
import { fetchPlaceDetails } from '../planner/api'
import type { PlaceDetail } from '../planner/api'
import type { BuiltCourse } from '../planner/logic'

const GREEN = '#00A46E'
export const MODAL_CLOSE_MS = 280 // planner.css pl-sheet-down 길이와 맞춤
```

그 아래에 PlannerApp **1400–1568줄**(`/* ── 코스 상세 모달` 주석부터 `RouteMap` 끝까지)을 그대로 붙이고, `function CourseModal`만 `export default function CourseModal`로 바꾼다.

- [ ] **Step 2: `pages/TabLayout.tsx` 작성**

```tsx
// 하단 탭바가 있는 화면들의 공통 틀 — 탭바가 화면 전환 사이에도 그대로 있어서 활성 표시가 미끄러져 따라간다
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import BottomTabs from '../planner/BottomTabs'
import type { HomeTab } from '../planner/BottomTabs'
import { useCourses } from '../state/courses'

const PATH: Record<HomeTab, string> = { home: '/', course: '/courses', search: '/search', saved: '/saved', my: '/my' }

export function tabOf(pathname: string): HomeTab | null {
  if (pathname === '/') return 'home'
  if (pathname === '/courses' || pathname.startsWith('/course/')) return 'course'
  const t = pathname.slice(1) as HomeTab
  return t in PATH ? t : null
}

export default function TabLayout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { saved } = useCourses()
  return (
    <div className="pl-app">
      <Outlet />
      <BottomTabs active={tabOf(pathname)} savedCount={saved.length} onSelect={(t) => navigate(PATH[t])} />
    </div>
  )
}
```

- [ ] **Step 3: `pages/CoursesPage.tsx` 작성**

파일 머리:

```tsx
// /courses — 조건 칩 + AI 코스 목록. 분석 전이면 고정 코스와 '취향 분석하기'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import CourseCard, { CourseCardSkeleton } from '../planner/CourseCards'
import { COND, DEFAULT_COND, Q, label as labelOf } from '../planner/data'
import { matchCond } from '../planner/logic'
import type { BuiltCourse, Taste } from '../planner/logic'
import { useAnalysis, useBuilt } from '../state/analysis'
import type { AiState } from '../state/analysis'

const GREEN = '#00A46E'

export default function CoursesPage() {
  const a = useAnalysis()
  const { list } = useBuilt()
  const navigate = useNavigate()
  const location = useLocation()
  const [sheetKey, setSheetKey] = useState<string | null>(null)
  // 결과 화면에 처음 들어오면 AI 코스 생성 (실패해도 고정 코스는 그대로 보임)
  useEffect(() => {
    if (a.hasResult && a.ai.status === 'idle') a.generateAi()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 상태가 idle로 바뀔 때만
  }, [a.hasResult, a.ai.status])
  return (
    <SearchTab
      cond={a.cond} setCond={(fn) => a.patch({ cond: fn(a.cond) })}
      sheet={COND.find((c) => c.key === sheetKey) || null} setSheetKey={setSheetKey}
      built={list} filtered={list.filter((c) => matchCond(c, a.cond))}
      taste={a.effTaste} tags={a.effTags} hasResult={a.hasResult}
      restart={() => { a.restart(); navigate('/start') }}
      openCourse={(id) => navigate('/course/' + id, { state: { background: location } })}
      ai={a.ai} generateAi={a.generateAi}
    />
  )
}
```

그 아래에 PlannerApp **1221–1340줄**(`SearchTab`, `AiBanner`)을 붙이고 다음만 바꾼다:
1. `SearchTab` props 타입에 `hasResult: boolean` 추가, 구조분해에도 `hasResult` 추가. `setCond` 타입은 그대로.
2. `resultHead` 줄을 교체:

```tsx
  const resultHead = !hasResult ? '이런 코스는 어때요?' : ai.status === 'loading' || ai.status === 'idle' ? '코스를 만들고 있어요' : filtered.length ? `추천 코스 ${filtered.length}개` : '조건에 맞는 코스가 없어요'
```

3. `profileLine` 줄을 교체 (분석 전엔 취향 문구가 거짓이 되므로):

```tsx
  const profileLine = hasResult
    ? '기록에서 읽은 취향 · ' + [labelOf(Q[2].opts, taste.hour), labelOf(Q[3].opts, taste.spend)].filter(Boolean).join(' · ') + (tags.length ? ' · ' + tags.join('·') : '')
    : '아직 취향 분석 전이라 기본 코스를 보여드려요'
```

4. `<div className="pl-pillbtn" onClick={restart}>다시 분석</div>`의 글자를 `{hasResult ? '다시 분석' : '취향 분석하기'}`로.
5. 빈 목록 안내 조건 `(ai.status === 'done' || ai.status === 'error')`를 `(!hasResult || ai.status === 'done' || ai.status === 'error')`로.

`AiBanner`는 그대로. `AiState`는 이제 `../state/analysis`에서 import(위 머리에 있음).

- [ ] **Step 4: `pages/CourseModalRoute.tsx` 작성**

```tsx
// /course/:id — 목록 위에 뜨는 코스 상세. 공유 링크로 바로 들어오면 서버에서 코스를 받아온다
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import CourseModal, { MODAL_CLOSE_MS } from '../components/CourseModal'
import ShareSheet from '../planner/ShareSheet'
import { fetchCourse } from '../planner/api'
import type { BuiltCourse } from '../planner/logic'
import { useBuilt } from '../state/analysis'
import { useCourses } from '../state/courses'
import { useToast } from '../state/toast'

export default function CourseModalRoute() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { getBuilt } = useBuilt()
  const c = useCourses()
  const toast = useToast()
  const course = getBuilt(id)
  const [closing, setClosing] = useState(false)
  const [shareOf, setShareOf] = useState<BuiltCourse | null>(null)

  const found = !!course
  useEffect(() => {
    if (found) return
    let alive = true
    fetchCourse(id)
      .then((x) => { if (alive) c.addCourses([x]) })
      .catch((e: Error) => {
        if (!alive) return
        toast(`코스를 열지 못했어요 · ${e.message}`)
        navigate('/courses', { replace: true })
      })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- id가 바뀌거나 아직 없을 때만
  }, [id, found])

  // 목록에서 열었으면 뒤로, 링크로 바로 왔으면 코스 목록으로
  const fromList = !!(location.state as { background?: unknown } | null)?.background
  const close = () => {
    if (closing) return
    const leave = () => (fromList ? navigate(-1) : navigate('/courses', { replace: true }))
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return leave()
    setClosing(true) // 내려가는 모션이 끝난 뒤 이동
    window.setTimeout(leave, MODAL_CLOSE_MS)
  }

  if (!course) return <div className="pl-modal-wrap"><div className="pl-sheet-backdrop" /></div>
  return (
    <>
      <CourseModal
        course={course}
        isSaved={c.saved.includes(course.id)}
        booked={c.booked}
        toggleBook={c.toggleBook}
        toggleSave={() => c.toggleSave(course.id)}
        start={() => navigate(`/course/${course.id}/live`)}
        share={() => setShareOf(course)}
        close={close}
        closing={closing}
      />
      {shareOf && (
        <ShareSheet
          course={shareOf}
          url={c.pool[shareOf.id]?.shareable ? `${window.location.origin}/course/${shareOf.id}` : ''}
          onClose={() => setShareOf(null)}
          toast={toast}
        />
      )}
    </>
  )
}
```

- [ ] **Step 5: `pages/LivePage.tsx` 작성**

```tsx
// /course/:id/live — 코스 진행(전체 화면 지도). 닫으면 코스 상세로
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import LiveCourse from '../planner/LiveCourse'
import { useBuilt } from '../state/analysis'
import { useCourses } from '../state/courses'

export default function LivePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const course = useBuilt().getBuilt(id)
  const c = useCourses()
  // 코스를 아직 모르면(새로고침·직접 접속) 상세 화면이 서버에서 받아온다
  if (!course) return <Navigate to={`/course/${id}`} replace />
  // 상세에서 들어왔으면 뒤로, 바로 들어왔으면 상세로
  const close = () => (location.key !== 'default' ? navigate(-1) : navigate(`/course/${id}`, { replace: true }))
  return <LiveCourse course={course} isSaved={c.saved.includes(id)} toggleSave={() => c.toggleSave(id)} onClose={close} />
}
```

- [ ] **Step 6: `main.tsx`에 Provider 감싸기**

`<App />`을 다음으로 교체하고 import 5줄 추가:

```tsx
import { ToastProvider } from './state/toast'
import { AuthProvider } from './state/auth'
import { CoursesProvider } from './state/courses'
import { AnalysisProvider } from './state/analysis'
import { ScanProvider } from './state/scan'
```

```tsx
      <ToastProvider>
        <AuthProvider>
          <CoursesProvider>
            <AnalysisProvider>
              <ScanProvider>
                <App />
              </ScanProvider>
            </AnalysisProvider>
          </CoursesProvider>
        </AuthProvider>
      </ToastProvider>
```

- [ ] **Step 7: `App.tsx`에 라우트 추가 (나머지는 아직 PlannerApp)**

```tsx
import { lazy, Suspense } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import type { Location } from 'react-router-dom'
import PlannerApp from './planner/PlannerApp'
import TabLayout from './pages/TabLayout'
import CoursesPage from './pages/CoursesPage'
import CourseModalRoute from './pages/CourseModalRoute'
import LivePage from './pages/LivePage'

const ScanDemo = import.meta.env.DEV ? lazy(() => import('./planner/ScanDemo')) : null

export default function App() {
  const location = useLocation()
  // 목록에서 연 상세는 목록 위에 모달로 — 배경 화면을 그대로 그린다
  const background = (location.state as { background?: Location } | null)?.background
  if (ScanDemo && new URLSearchParams(window.location.search).has('scan-demo')) {
    return <Suspense><ScanDemo /></Suspense>
  }
  return (
    <>
      <Routes location={background || location}>
        <Route element={<TabLayout />}>
          <Route path="/courses" element={<CoursesPage />} />
          {/* 링크로 바로 들어오면 코스 목록을 배경으로 깐다 */}
          <Route path="/course/:id" element={<><CoursesPage /><CourseModalRoute /></>} />
        </Route>
        <Route path="/course/:id/live" element={<LivePage />} />
        <Route path="*" element={<PlannerApp />} />
      </Routes>
      {background && (
        <Routes>
          <Route path="/course/:id" element={<CourseModalRoute />} />
        </Routes>
      )}
    </>
  )
}
```

- [ ] **Step 8: 없는 코스 직접 접속 테스트** — `src/pages/CourseModalRoute.test.tsx`

```tsx
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { fetchCourse } from '../planner/api'
import { ToastProvider } from '../state/toast'
import { AuthProvider } from '../state/auth'
import { CoursesProvider } from '../state/courses'
import { AnalysisProvider } from '../state/analysis'
import CourseModalRoute from './CourseModalRoute'

vi.mock('../planner/api', async (orig) => ({ ...(await orig<typeof import('../planner/api')>()), fetchCourse: vi.fn(), fetchMe: vi.fn(() => new Promise(() => {})) }))
beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
})
afterEach(cleanup)

function Where() { return <div data-testid="where">{useLocation().pathname}</div> }

it('없는 코스 id로 들어오면 안내 후 /courses로', async () => {
  vi.mocked(fetchCourse).mockRejectedValue(new Error('요청 실패 (HTTP 404)'))
  render(
    <MemoryRouter initialEntries={['/course/nope']}>
      <ToastProvider><AuthProvider><CoursesProvider><AnalysisProvider>
        <Routes>
          <Route path="/course/:id" element={<CourseModalRoute />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </AnalysisProvider></CoursesProvider></AuthProvider></ToastProvider>
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/courses'))
  expect(screen.getByRole('status').textContent).toContain('코스를 열지 못했어요')
})
```

Run: `npx vitest run src/pages/CourseModalRoute.test.tsx`
Expected: PASS

- [ ] **Step 9: 수동 확인**

`npm run dev` → `/courses` 직접 접속: 고정 코스 목록 + '취향 분석하기' + 하단 탭 '코스' 활성. 카드 클릭 → 주소 `/course/c1`, 목록 위 모달. 뒤로가기 → 모달 닫히고 `/courses`. 모달에서 새로고침 → 목록 배경 + 모달. '코스 시작' → `/course/c1/live`, 닫기 → 모달.

- [ ] **Step 10: 전체 검증 후 Commit**

Run: `npx tsc -b && npx vite build && npx oxlint && npx vitest run`

```bash
git add src/components/CourseModal.tsx src/pages src/main.tsx src/App.tsx
git commit -m "feat: 코스 목록·상세·진행을 /courses, /course/:id, /course/:id/live 페이지로

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 홈·검색·저장·마이 페이지

**Files:**
- Create: `frontend/src/pages/usePlaces.ts`
- Create: `frontend/src/components/HomeParts.tsx`
- Create: `frontend/src/pages/HomePage.tsx`
- Create: `frontend/src/pages/SearchPage.tsx`
- Create: `frontend/src/pages/SavedPage.tsx`
- Create: `frontend/src/pages/MyPage.tsx`
- Modify: `frontend/src/planner/HomeViews.tsx` (SavedView 삭제, 160–200줄)
- Delete: `frontend/src/planner/HomeScreen.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useAuth`, `useCourses`, `useAnalysis`, `useBuilt`, `useToast`, `TabLayout`
- Produces: `usePlaces(): { places: Place[]; failed: boolean; ready: boolean }`, `SOON` 문구 상수(HomePage export)

- [ ] **Step 1: `pages/usePlaces.ts`**

```ts
// 장소 목록(Supabase) — 처음 한 번 받아 두고 여러 화면이 같이 쓴다 (geo.ts가 캐시)
import { useEffect, useState } from 'react'
import { allPlaces, loadPlaces } from '../planner/geo'
import type { Place } from '../planner/geo'

export function usePlaces() {
  const [places, setPlaces] = useState<Place[]>(() => allPlaces())
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    loadPlaces()
      .then(() => { if (alive) setPlaces(allPlaces()) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])
  return { places, failed, ready: places.length > 0 }
}
```

`allPlaces()`가 로드 전에 빈 배열을 돌려주는지 `planner/geo.ts`에서 확인. 로드 전 호출이 throw하면 초기값을 `[]`로.

- [ ] **Step 2a: `components/HomeParts.tsx`** (HomePage가 250줄을 넘지 않게 홈 조각을 분리)

머리:

```tsx
// 홈 화면 조각 — 배너(Hero), 오늘의 추천 코스, '이런 데이트도 좋아요' 목록, 등장 모션
import { useEffect, useMemo, useState } from 'react'
import KindThumb from '../planner/KindThumb'
import { placeInfo } from '../planner/geo'
import type { Place } from '../planner/geo'
import { COURSES, durLabel, won } from '../planner/data'
import type { Course } from '../planner/data'
```

그 아래에 HomeScreen.tsx **12–13줄**(`HERO_MS`, `REC_MS`)과 **20–178줄**(`HERO_PIDS`부터 `RecCourses` 끝까지)을 그대로 옮기고, `MOODS`, `useReveal`, `pickPlaces`, `Hero`, `RecCourses` 앞에 `export`를 붙인다.

- [ ] **Step 2b: `pages/HomePage.tsx`**

머리:

```tsx
// / — 고정 배너 + 덮으며 올라오는 판(추천 코스·이런 데이트·지금 가볼 만한 곳)
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import KindThumb from '../planner/KindThumb'
import type { Place } from '../planner/geo'
import { PlaceSheet } from '../planner/HomeViews'
import { Hero, MOODS, RecCourses, pickPlaces, useReveal } from '../components/HomeParts'
import { useAuth } from '../state/auth'
import { useAnalysis } from '../state/analysis'
import { useToast } from '../state/toast'
import { usePlaces } from './usePlaces'

export const SOON = '아직 구현 중이에요. 조금만 기다려 주세요!'
```

페이지 본체:

```tsx
export default function HomePage() {
  const { token, user } = useAuth()
  const authed = !!token || !!user
  const userName = user?.name || ''
  const a = useAnalysis()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const { places, failed, ready } = usePlaces()
  const [picked, setPicked] = useState<Place | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const marquee = useMemo(() => pickPlaces(places, 14), [places]) // 한 번 고른 뒤 안 바뀌게
  useReveal(scrollRef, ready)

  // 내용이 배너를 덮을 만큼 올라오면 상단바에 배경을 깐다 (안 그러면 흰 로고가 안 보인다)
  const [solid, setSolid] = useState(false)
  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; setSolid(sc.scrollTop > 150) })
    }
    onScroll()
    sc.addEventListener('scroll', onScroll, { passive: true })
    return () => { sc.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])

  // 홈에서 코스를 만들면 늘 취향 분석부터 (로그인 안 했으면 RequireAuth가 로그인으로 보낸다)
  const onStart = () => { a.restart(); navigate('/start') }
  const soon = () => toast(SOON)
```

`return (...)`은 HomeScreen.tsx **257–369줄**의 JSX에서 `home`이 true인 경우만 남긴 것이다. 구체적으로:
- 259–271줄: `{home ? (<div className="pl-topbar"...>...</div>) : (...)}` → `<div className={'pl-topbar' + (solid ? ' solid' : '')}>...</div>`만 남긴다. 그 안의 로그인 버튼 `onClick={onLogin}` → `onClick={() => navigate('/login?next=%2F')}`, 알림 `onClick={soon}` 유지.
- 273–287줄(검색창) 삭제.
- 289줄 `.pl-scroll`과 290줄 `failed` 안내 유지.
- 292–351줄 `{home && (<>...</>)}` → 괄호 안 내용만 남긴다. 그 안에서:
  - `<RecCourses ready={ready} onOpen={onOpenCourse} onAll={() => setTab('course')} />` → `<RecCourses ready={ready} onOpen={(id) => navigate('/course/' + id, { state: { background: location } })} onAll={() => navigate('/courses')} />`
  - 무드 버튼 `onClick={() => { setKind(m.kind); go('search') }}` → `onClick={() => navigate('/search?kind=' + encodeURIComponent(m.kind))}`
- 353–362줄(search·saved·my 탭 내용) 삭제.
- 365줄 `<BottomTabs .../>` 삭제 (TabLayout이 그린다).
- 367줄 `PlaceSheet` 유지, 368줄 toast 삭제 (ToastProvider가 그린다).

- [ ] **Step 3: `pages/SearchPage.tsx`**

```tsx
// /search — 장소 검색. ?kind=카페 로 들어오면 그 종류 목록
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CategoryView, PlaceSheet, SearchView } from '../planner/HomeViews'
import type { Place } from '../planner/geo'
import { usePlaces } from './usePlaces'

export default function SearchPage() {
  const { places, failed } = usePlaces()
  const [params, setParams] = useSearchParams()
  const kind = params.get('kind')
  const setKind = (k: string | null) => setParams(k ? { kind: k } : {}, { replace: true })
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Place | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!kind) searchRef.current?.focus() }, [kind])

  return (
    <div className="pl-screen pl-screen-fixed">
      <div className="pl-vtitle">검색</div>
      <div className="pl-home-search">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="어디서 놀까요? 장소·동네 검색" aria-label="장소 검색" />
        {!!q && <button type="button" className="pl-home-clear" onClick={() => setQ('')} aria-label="검색어 지우기">✕</button>}
      </div>
      <div className="pl-scroll" style={{ padding: '0 0 104px' }}>
        {failed && <div className="pl-home-empty">장소를 불러오지 못했어요. 잠시 뒤 다시 열어주세요.</div>}
        {kind
          ? <CategoryView places={places} kind={kind} setKind={setKind} onPick={setPicked} />
          : <SearchView places={places} q={q} setQ={setQ} onPick={setPicked} />}
      </div>
      {picked && <PlaceSheet p={picked} onClose={() => setPicked(null)} />}
    </div>
  )
}
```

- [ ] **Step 4: `pages/SavedPage.tsx`**

머리:

```tsx
// /saved — 저장한 코스 (홈 탭과 코스 화면 탭에 두 벌 있던 것을 하나로)
import { useLocation, useNavigate } from 'react-router-dom'
import type { BuiltCourse } from '../planner/logic'
import { useAnalysis, useBuilt } from '../state/analysis'
import { useCourses } from '../state/courses'

export default function SavedPage() {
  const c = useCourses()
  const { cond } = useAnalysis()
  const { getBuilt } = useBuilt()
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <SavedTab
      savedBuilt={c.saved.map(getBuilt).filter(Boolean) as BuiltCourse[]}
      people={cond.people}
      openCourse={(id) => navigate('/course/' + id, { state: { background: location } })}
      remove={c.toggleSave}
      goSearch={() => navigate('/courses')}
    />
  )
}
```

그 아래에 PlannerApp **1342–1396줄**(`SavedTab`)을 그대로 붙인다.

- [ ] **Step 5: `pages/MyPage.tsx`**

```tsx
// /my — 프로필·로그아웃. 로그아웃 버튼은 앱에서 여기 하나뿐이다
import { useNavigate } from 'react-router-dom'
import { MyView } from '../planner/HomeViews'
import { useAuth } from '../state/auth'
import { useAnalysis } from '../state/analysis'
import { useCourses } from '../state/courses'
import { useToast } from '../state/toast'
import { SOON } from './HomePage'

export default function MyPage() {
  const auth = useAuth()
  const a = useAnalysis()
  const { saved } = useCourses()
  const toast = useToast()
  const navigate = useNavigate()
  return (
    <div className="pl-screen pl-screen-fixed">
      <div className="pl-vtitle">마이페이지</div>
      <div className="pl-scroll" style={{ padding: '0 0 104px' }}>
        <MyView
          authed={!!auth.token} userName={auth.user?.name || ''} avatar={auth.user?.avatar || null} savedCount={saved.length}
          onLogin={() => navigate('/login?next=%2Fmy')}
          onSaved={() => navigate('/saved')}
          onStart={() => { a.restart(); navigate('/start') }}
          onRename={auth.updateProfile}
          onLogout={() => {
            // 분석 결과·유튜브 연동까지 끊고 홈으로
            a.restart(); a.setYtId(null); auth.logout()
            navigate('/', { replace: true })
          }}
          soon={() => toast(SOON)}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: `HomeViews.tsx`에서 `SavedView` 삭제**

160–200줄(`// ── 저장 ──` 주석부터 `SavedView` 함수 끝까지) 삭제. 삭제 후 `Chevron`·`Course` import가 다른 곳에서 안 쓰이면 `tsc`의 `noUnusedLocals`가 알려준다 — 그때만 지운다.

- [ ] **Step 7: `planner/HomeScreen.tsx` 삭제**

```bash
git rm src/planner/HomeScreen.tsx
```

- [ ] **Step 8: `App.tsx` 라우트 추가**

import 4줄 추가:

```tsx
import HomePage from './pages/HomePage'
import SearchPage from './pages/SearchPage'
import SavedPage from './pages/SavedPage'
import MyPage from './pages/MyPage'
```

`<Route element={<TabLayout />}>` 안 맨 앞에 추가:

```tsx
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/saved" element={<SavedPage />} />
          <Route path="/my" element={<MyPage />} />
```

`background` 모달 라우트는 이미 `/course/:id`만 받으므로 홈 위 모달도 그대로 동작한다.

PlannerApp에서 `import HomeScreen from './HomeScreen'` 줄과 `if (atHome) {` 로 시작해 `<HomeScreen ... />`를 return하는 블록 전체를 삭제한다 — HomeScreen.tsx가 없으므로 안 지우면 빌드 실패. (Task 1에서 앞부분 26줄을 지웠으므로 8d32544의 줄 번호 574–620과 지금 위치가 다르다. 줄 번호 말고 내용으로 찾는다.) `atHome`이 쓰이던 다른 줄(`setAtHome(...)`)은 그대로 둬도 동작엔 상관없지만 `tsc`가 `atHome` 미사용 경고를 내면 `const [, setAtHome]`로 바꾼다. (PlannerApp은 Task 10에서 삭제)

- [ ] **Step 9: 수동 확인**

`/` → 홈. 하단 탭 홈→검색→저장→마이→코스 누를 때마다 주소가 `/`·`/search`·`/saved`·`/my`·`/courses`로 바뀌고 활성 표시가 미끄러져 이동. 뒤로가기로 이전 탭 복귀. '이런 데이트도 좋아요 › 산책' → `/search?kind=산책`. 추천 코스 카드 → 홈 위에 모달, 닫으면 홈. 화면 아래 탭바 위치·여백이 이전과 같은지 (`.pl-hometab`이 `.pl-screen-fixed` 밖 `.pl-app`으로 옮겨짐).

- [ ] **Step 10: 전체 검증 후 Commit**

Run: `npx tsc -b && npx vite build && npx oxlint && npx vitest run`

```bash
git add -A src
git commit -m "feat: 홈·검색·저장·마이를 /, /search, /saved, /my 페이지로 — 저장 화면 하나로 통일

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 로그인 페이지 + 진입 처리 + 스플래시

**Files:**
- Create: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `readEntry`, `takeReturnTo`, `saveReturnTo`, `takePending` (Task 2); `useAuth` (Task 3); `useAnalysis` (Task 4); `useScan().start` (Task 5); `LAST_PROVIDER_KEY` (Task 3)
- Produces: `/login?next=&error=` 페이지, `EntryHandler`(App.tsx 내부)

- [ ] **Step 1: 실패하는 테스트 작성** — `src/App.test.tsx`

```tsx
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { fetchMe } from './planner/api'
import { ToastProvider } from './state/toast'
import { AuthProvider } from './state/auth'
import { CoursesProvider } from './state/courses'
import { AnalysisProvider } from './state/analysis'
import { ScanProvider } from './state/scan'
import { EntryHandler } from './App'

vi.mock('./planner/api', async (orig) => ({ ...(await orig<typeof import('./planner/api')>()), fetchMe: vi.fn(() => new Promise(() => {})) }))
beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
})
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.mocked(fetchMe).mockClear() })
afterEach(cleanup)

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname + l.search}</div> }
function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider><AuthProvider><CoursesProvider><AnalysisProvider><ScanProvider>
        <EntryHandler><Where /></EntryHandler>
      </ScanProvider></AnalysisProvider></CoursesProvider></AuthProvider></ToastProvider>
    </MemoryRouter>,
  )
}

it('로그인 복귀: 토큰 저장 후 떠나기 전 경로로 replace', async () => {
  sessionStorage.setItem('nolda:return-to', '/saved')
  renderAt('/?login_token=x')
  await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/saved'))
  expect(localStorage.getItem('nolda:login-token')).toBe('x')
  expect(vi.mocked(fetchMe)).toHaveBeenCalledWith('x')
})
it('로그인 실패 복귀: /login?error=', async () => {
  renderAt('/?login_error=cancelled')
  await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/login?error=' + encodeURIComponent('카카오 로그인을 취소했어요.')))
})
it('옛 공유 링크 /?course=abc → /course/abc', async () => {
  renderAt('/?course=abc')
  await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/course/abc'))
})
it('유튜브 실패 복귀: /start', async () => {
  renderAt('/?yt_error=access_denied')
  await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/start'))
})
it('쿼리 없으면 그대로', () => {
  renderAt('/my')
  expect(screen.getByTestId('where').textContent).toBe('/my')
})
it('StrictMode에서 유튜브 복귀는 한 번만 처리', async () => {
  vi.mocked(fetchYoutubeTaste).mockReturnValue(new Promise(() => {}))
  render(
    <StrictMode>
      <MemoryRouter initialEntries={['/?yt=r1']}>
        <ToastProvider><AuthProvider><CoursesProvider><AnalysisProvider><ScanProvider>
          <EntryHandler><Where /></EntryHandler>
        </ScanProvider></AnalysisProvider></CoursesProvider></AuthProvider></ToastProvider>
      </MemoryRouter>
    </StrictMode>,
  )
  await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/scan'))
  expect(vi.mocked(fetchYoutubeTaste)).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem('nolda:yt-id')).toBe('r1')
})
```

테스트 파일 머리의 import·mock을 다음으로 맞춘다:

```tsx
import { StrictMode } from 'react'
import { fetchMe, fetchYoutubeTaste } from './planner/api'
vi.mock('./planner/api', async (orig) => ({ ...(await orig<typeof import('./planner/api')>()), fetchMe: vi.fn(() => new Promise(() => {})), fetchYoutubeTaste: vi.fn() }))
```

(`beforeEach`에 `vi.mocked(fetchYoutubeTaste).mockReset()` 추가.)

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — `EntryHandler` is not exported

- [ ] **Step 3: `pages/LoginPage.tsx` 작성**

머리:

```tsx
// /login — 소셜 로그인. ?next=로 끝나면 돌아갈 곳, ?error=로 소셜 로그인 실패 안내
import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { googleLoginUrl, kakaoLoginUrl } from '../planner/api'
import { saveReturnTo } from '../entry'
import { LAST_PROVIDER_KEY, useAuth } from '../state/auth'

export default function LoginPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { token, guest, continueAsGuest } = useAuth()
  const next = params.get('next') || '/'
  const error = params.get('error')
  if (error) return <LoginErrorScreen message={error} goHome={() => navigate('/', { replace: true })} />
  if (token || guest) return <Navigate to={next} replace />
  return (
    <AuthScreen
      goHome={() => navigate('/')}
      // 소셜 로그인은 페이지를 떠난다 — 돌아올 곳을 적어 두고 간다
      go={(url) => { saveReturnTo(next); window.location.href = url }}
      skip={() => { continueAsGuest(); navigate(next, { replace: true }) }}
    />
  )
}
```

그 아래에 PlannerApp **717–838줄**(`AuthScreen`, `LoginErrorScreen`, 주석 처리된 `Field`)을 붙이고 `AuthScreen`만 다음처럼 바꾼다:
1. 시그니처: `function AuthScreen({ goHome, go, skip }: { goHome: () => void; go: (url: string) => void; skip: () => void }) {`
2. 함수 첫 줄에 `const [error, setError] = useState('')` 추가. `const signup = auth.mode === 'signup'` → `const signup = false // 이메일 가입은 보류 중 (docs/deferred-email-password-login.md)`.
3. 본문의 `auth.error` → `error` (769, 771줄 두 곳).
4. 소셜 버튼 onClick(776줄): `try { go(p.key === 'kakao' ? kakaoLoginUrl() : googleLoginUrl()) } catch (e) { setError((e as Error).message) }`
5. 다른 구글 계정(785줄): `try { go(googleLoginUrl(true)) } catch (e) { setError((e as Error).message) }`
6. 둘러보기(787–789줄): `<div className="pl-skip" onClick={skip}>로그인 없이 둘러보기</div>`
7. 주석 블록 안의 `auth`·`setAuth` 언급은 주석이라 그대로 둔다.

- [ ] **Step 4: `App.tsx`에 EntryHandler·스플래시·로그인 라우트 추가**

`App.tsx` 전체를 다음으로 교체:

```tsx
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import type { Location } from 'react-router-dom'
import PlannerApp from './planner/PlannerApp'
import SplashScreen from './planner/SplashScreen'
import { loadPlaces } from './planner/geo'
import { takePhotos } from './planner/photoStash'
import { readEntry, takePending, takeReturnTo } from './entry'
import { useAuth } from './state/auth'
import { useAnalysis } from './state/analysis'
import { useScan } from './state/scan'
import TabLayout from './pages/TabLayout'
import HomePage from './pages/HomePage'
import SearchPage from './pages/SearchPage'
import SavedPage from './pages/SavedPage'
import MyPage from './pages/MyPage'
import CoursesPage from './pages/CoursesPage'
import CourseModalRoute from './pages/CourseModalRoute'
import LivePage from './pages/LivePage'
import LoginPage from './pages/LoginPage'

const ScanDemo = import.meta.env.DEV ? lazy(() => import('./planner/ScanDemo')) : null
const SPLASH_KEY = 'nolda:splashed'

/** 소셜 로그인·유튜브 연동에서 돌아온 쿼리를 처리하고 갈 곳으로 replace. 처리 중엔 아무것도 안 그린다 */
export function EntryHandler({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const auth = useAuth()
  const a = useAnalysis()
  const scan = useScan()
  const [entry] = useState(() => readEntry(location.search))
  const [busy, setBusy] = useState(entry.kind !== 'none')
  const done = useRef(false) // StrictMode에서 effect가 두 번 돌아도 한 번만

  useEffect(() => {
    if (done.current || entry.kind === 'none') return
    done.current = true
    const to = (path: string) => { navigate(path, { replace: true }); setBusy(false) }
    switch (entry.kind) {
      case 'login': auth.signIn(entry.token); return to(takeReturnTo())
      case 'loginError': return to('/login?error=' + encodeURIComponent(entry.message))
      case 'course': return to('/course/' + encodeURIComponent(entry.id))
      case 'youtubeError': a.setScanError(entry.message); return to('/start')
      case 'youtube': {
        // 고른 소스·사진을 되살려 바로 분석 시작 (사진 복원에 실패하면 유튜브만으로)
        const src = takePending() || { youtube: true, photos: false }
        a.setYtId(entry.id)
        void (src.photos ? takePhotos() : Promise.resolve([] as File[])).then((files) => {
          const s = { ...src, photos: src.photos && files.length > 0 }
          a.setSources(() => s); a.setPhotoFiles(files)
          scan.start(s, files, entry.id, { replace: true })
          setBusy(false)
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 앱 진입 때 한 번
  }, [])

  return busy ? null : children
}

export default function App() {
  const location = useLocation()
  const background = (location.state as { background?: Location } | null)?.background
  // 앱을 연 직후 로고 (탭당 1회). 소셜 로그인 등에서 돌아온 경우엔 건너뜀
  const [splash, setSplash] = useState(() => {
    try { return !location.search && !sessionStorage.getItem(SPLASH_KEY) } catch { return false }
  })
  const endSplash = () => { try { sessionStorage.setItem(SPLASH_KEY, '1') } catch { /* 다음에도 보임 */ } setSplash(false) }
  // 장소 데이터를 받은 뒤 한 번 다시 그려서 지도 핀·장소 정보가 보이게
  const [, setPlacesReady] = useState(false)
  useEffect(() => { loadPlaces().then(() => setPlacesReady(true)).catch((e: Error) => console.error('[places]', e.message)) }, [])

  if (ScanDemo && new URLSearchParams(location.search).has('scan-demo')) return <Suspense><ScanDemo /></Suspense>
  if (splash) return <SplashScreen onDone={endSplash} />
  return (
    <EntryHandler>
      <Routes location={background || location}>
        <Route element={<TabLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/saved" element={<SavedPage />} />
          <Route path="/my" element={<MyPage />} />
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/course/:id" element={<><CoursesPage /><CourseModalRoute /></>} />
        </Route>
        <Route path="/course/:id/live" element={<LivePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<PlannerApp />} />
      </Routes>
      {background && (
        <Routes>
          <Route path="/course/:id" element={<CourseModalRoute />} />
        </Routes>
      )}
    </EntryHandler>
  )
}
```

`SplashScreen`의 `onDone`은 effect 의존성에 들어가므로 `endSplash`가 매 렌더 새 함수여도 스플래시는 한 번 뜬 뒤 사라지면 다시 안 그려진다(문제 없음). `SplashScreen.tsx` 첫 줄 주석 `(PlannerApp이 관리)` → `(App이 관리)`로 수정.

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 6: PlannerApp 정리**

PlannerApp에서 다음을 삭제(Task 10에서 파일째 지우지만 그 전까지 두 곳이 동시에 로그인 쿼리를 처리하지 않게). 앞 Task들에서 줄이 지워져 위치가 바뀌었으므로 **시작 주석·코드로 찾는다**:
- `// 카카오 로그인에서 돌아왔을 때(?login_token=)`로 시작하는 `useEffect` 전체
- `// 구글 로그인에서 돌아왔을 때`로 시작하는 `useEffect` 전체
- `// 공유 링크로 들어온 코스 불러오기`로 시작하는 `useEffect`와 바로 아래 `const leaveShared = ...` 함수
- `if (sharedId) {`로 시작하는 return 블록
- `if (loginError) {`, `if (splash) {` 블록
남는 `useState`(`sharedId`, `loginError`, `splash`, `returning`)와 import가 미사용이 되면 `tsc`가 알려주는 대로 지운다.

- [ ] **Step 7: 수동 확인**

`npm run dev` (백엔드 `VITE_API_BASE_URL` 설정된 상태): 홈 상단 '로그인' → `/login?next=%2F` → 카카오 로그인 → 홈으로 돌아오고 상단 '로그인' 버튼 사라짐. `/my`에서 '로그인' → 돌아오면 `/my`. 카카오 화면에서 취소 → '로그인에 실패했어요' 화면, '홈으로 돌아가기' → `/`.

- [ ] **Step 8: 전체 검증 후 Commit**

Run: `npx tsc -b && npx vite build && npx oxlint && npx vitest run`

```bash
git add -A src
git commit -m "feat: /login 페이지와 진입 처리 — 소셜 로그인 후 떠나기 전 화면으로 복귀

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 분석 흐름 페이지 (`/start`, `/scan`, `/summary`)

**Files:**
- Create: `frontend/src/components/Controls.tsx`
- Create: `frontend/src/pages/DataSourcePage.tsx`
- Create: `frontend/src/pages/ScanPage.tsx`
- Create: `frontend/src/pages/SummaryPage.tsx`
- Modify: `frontend/src/planner/ScanDemo.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useAnalysis`, `useScan`, `RequireAuth`, `RequireReport`, `SCENE_LAUNCH_MS`
- Produces: `export function DataSourceScreen` (props 그대로), `export function ScanningScreen` (props 그대로) — ScanDemo가 씀

- [ ] **Step 1: `components/Controls.tsx`**

머리:

```tsx
// 요약 화면의 입력 조각 — 칩, 시간대 막대, 예산 막대
import { Q, label as labelOf } from '../planner/data'
import { hourBucket } from '../state/analysis'

const GREEN = '#00A46E'
```

그 아래에 PlannerApp **1127–1219줄**을 붙이되:
- 1130줄 `const HOUR_DEFAULT = ...`와 1131줄 `const hourBucket = ...` 두 줄은 **지운다** (`state/analysis.tsx`로 옮겨 갔음).
- `function HourRange`, `function BudgetSlider`, `function Chip` 앞에 `export`.

- [ ] **Step 2: `pages/DataSourcePage.tsx`**

머리:

```tsx
// /start — 유튜브·사진 고르기 (취향 유형 테스트 시작)
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PhotoIcon, YoutubeIcon } from '../planner/Kiosk'
import { CardFan } from '../planner/AnalysisGame'
import { keepReadable } from '../planner/photoMeta'
import type { Sources } from '../planner/logic'
import { useAnalysis } from '../state/analysis'
import { SCENE_LAUNCH_MS, useScan } from '../state/scan'

export default function DataSourcePage() {
  const a = useAnalysis()
  const scan = useScan()
  const navigate = useNavigate()
  // 브라우저가 못 읽는 형식(HEIC 등)은 여기서 걸러서, 분석 단계에서 조용히 사라지지 않게 한다
  const onPickPhotos = (files: File[]) => {
    a.setScanError('')
    void keepReadable(files).then(({ ok, bad }) => {
      if (bad.length) a.setScanError(`${bad.length}장은 이 브라우저가 열 수 없는 형식이라 제외했어요 (아이폰 HEIC는 JPG로 저장해 주세요)`)
      if (!ok.length) return a.setSources((st) => ({ ...st, photos: false }))
      a.setPhotoFiles(ok)
      a.setSources((st) => ({ ...st, photos: true }))
    })
  }
  return (
    <DataSourceScreen
      sources={a.sources} setSources={a.setSources} error={a.scanError}
      goHome={() => { a.restart(); navigate('/') }}
      startScan={() => scan.start(a.sources, a.photoFiles, a.ytId)}
      skipScan={() => { a.skip(); navigate('/courses') }}
      photoCount={a.photoFiles.length} onPickPhotos={onPickPhotos}
      onClearPhotos={() => { a.setPhotoFiles([]); a.setSources((st) => ({ ...st, photos: false })) }}
    />
  )
}
```

그 아래에 PlannerApp **840–922줄**(`DataSourceScreen`)을 그대로 붙인다(`export function` 유지).

- [ ] **Step 3: `pages/ScanPage.tsx`**

머리:

```tsx
// /scan — 분석 중(장소 카드 스와이프) · 분석 완료(취향 유형 발표). 분석 자체는 ScanProvider가 돌린다
import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { SwipeDeck, TypeReveal } from '../planner/AnalysisGame'
import { pickTasteType } from '../planner/tasteType'
import type { Swipe } from '../planner/tasteType'
import type { YoutubeTaste } from '../planner/api'
import { scanSteps } from '../planner/logic'
import type { Sources } from '../planner/logic'
import { useAnalysis } from '../state/analysis'
import { useScan } from '../state/scan'
import type { ScanResult } from '../state/scan'

export default function ScanPage() {
  const scan = useScan()
  const a = useAnalysis()
  const navigate = useNavigate()
  // 분석이 안 돌고 있으면(새로고침 등 — 고른 사진은 저장되지 않는다) 다시 고르기부터
  if (!scan.active) return <Navigate to="/start" replace />
  return (
    <ScanningScreen
      sources={scan.src} yt={scan.yt} loading={scan.ytLoading} scanN={scan.scanN} photoUrls={scan.photoUrls}
      ready={scan.ready} onResult={scan.reveal}
      swipes={a.swipes} onSwipe={(x) => a.patch({ swipes: [...a.swipes.filter((y) => y.id !== x.id), x] })}
      cancelScan={() => { scan.cancel(); navigate('/start', { replace: true }) }}
    />
  )
}
```

그 아래에 PlannerApp **927–996줄**(`ScanningScreen`)을 그대로 붙인다(`export function` 유지). 925줄 `export interface ScanResult`는 붙이지 않는다(`state/scan`에서 import).

- [ ] **Step 4: `pages/SummaryPage.tsx`**

머리:

```tsx
// /summary — 이런 취향이 보여요 (분석 결과를 손보고 코스 추천으로)
import { useNavigate } from 'react-router-dom'
import { FIXED_Q_KEYS, Q } from '../planner/data'
import type { TasteTopic } from '../planner/api'
import type { Picks, Report, Taste } from '../planner/logic'
import { BudgetSlider, Chip, HourRange } from '../components/Controls'
import { useAnalysis } from '../state/analysis'

export default function SummaryPage() {
  const a = useAnalysis()
  const navigate = useNavigate()
  return (
    <SummaryScreen
      report={a.report!} taste={a.taste} setTaste={(fn) => a.patch({ taste: fn(a.taste) })}
      tags={a.tags} setTags={(fn) => a.patch({ tags: fn(a.tags) })}
      picks={a.picks} setPicks={(fn) => a.patch({ picks: fn(a.picks) })}
      intent={a.intent} setIntent={(v) => a.patch({ intent: v })}
      toStart={() => { a.restart(); navigate('/start') }}
      rescan={() => navigate('/start')}
      finish={() => { a.finish(); navigate('/courses') }}
      hourRange={a.range} setHourRange={a.setHourRange}
      budget={a.cond.budget} setBudget={(budget) => a.patch({ cond: { ...a.cond, budget } })}
    />
  )
}
```

그 아래에 PlannerApp **998–1125줄**(`SummaryScreen`)을 그대로 붙인다. (`RequireReport`가 바깥에서 막으므로 `a.report!`는 안전)

참고: SummaryPage는 `report`가 생긴 직후 AI 생성 상태(`ai`)가 `idle`이고, `/courses`에 들어가면 CoursesPage가 생성을 시작한다(기존 `done` → 생성과 같은 시점).

- [ ] **Step 5: `planner/ScanDemo.tsx` import 경로 수정**

8줄 `import { DataSourceScreen, SCAN_INTAKE_MS, SCAN_STEP_MS, ScanningScreen } from './PlannerApp'` →

```tsx
import { DataSourceScreen } from '../pages/DataSourcePage'
import { ScanningScreen } from '../pages/ScanPage'
import { SCAN_INTAKE_MS, SCAN_STEP_MS } from '../state/scan'
```

- [ ] **Step 6: `App.tsx` 라우트 추가**

import 추가:

```tsx
import { RequireAuth } from './state/auth'
import { RequireReport } from './state/analysis'
import DataSourcePage from './pages/DataSourcePage'
import ScanPage from './pages/ScanPage'
import SummaryPage from './pages/SummaryPage'
```

`<Route path="/login" .../>` 다음에:

```tsx
        <Route path="/start" element={<RequireAuth><DataSourcePage /></RequireAuth>} />
        <Route path="/scan" element={<RequireAuth><ScanPage /></RequireAuth>} />
        <Route path="/summary" element={<RequireAuth><RequireReport><SummaryPage /></RequireReport></RequireAuth>} />
```

- [ ] **Step 7: 수동 확인 (분석 흐름 전체)**

로그인 상태에서 홈 '오늘의 데이트 만들기' → `/start`. 사진만 골라 '취향 분석 시작' → `/scan`, 카드 스와이프, 결과 공개 → '결과 보기' → `/summary`(뒤로가기 시 `/start`, `/scan` 아님). 새로고침해도 `/summary` 유지. 'AI 코스 추천 받기' → `/courses`, AI 생성 배너. `/courses`에서 새로고침 → 받은 AI 코스 그대로(생성 중이었으면 다시 생성). 유튜브 연결 선택 → 구글 → 돌아오면 바로 `/scan`. 비로그인으로 `/start` 직접 접속 → `/login?next=%2Fstart` → '로그인 없이 둘러보기' → `/start`.

- [ ] **Step 8: 전체 검증 후 Commit**

Run: `npx tsc -b && npx vite build && npx oxlint && npx vitest run`

```bash
git add -A src
git commit -m "feat: 분석 흐름을 /start, /scan, /summary 페이지로

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: PlannerApp 삭제·문서 갱신·최종 확인

**Files:**
- Delete: `frontend/src/planner/PlannerApp.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `docs/feature-guide-home-and-shell.md`, `docs/feature-guide-taste-and-navigation.md`, `docs/deferred-email-password-login.md` (PlannerApp·HomeScreen·toStart 언급 부분)

- [ ] **Step 1: PlannerApp 삭제, 나머지 경로는 홈으로**

```bash
git rm src/planner/PlannerApp.tsx
```

`App.tsx`에서 `import PlannerApp ...` 줄 삭제, `<Route path="*" element={<PlannerApp />} />` →

```tsx
        <Route path="*" element={<Navigate to="/" replace />} />
```

(`Navigate`를 `react-router-dom` import에 추가.) 개발용 미리보기는 기존 `?scan-demo`를 그대로 둔다 — 쿼리 하나로 충분해서 `/dev/scan` 라우트는 만들지 않는다.

- [ ] **Step 2: 남은 참조 확인**

Run: `grep -rn "PlannerApp\|HomeScreen\|toStart\|AFTER_LOGIN_KEY\|skipNextPush" src`
Expected: `SummaryScreen`의 `toStart` prop 이름만 남음(그건 이제 `restart` + `/start` 이동이라 의미가 맞음). 그 외 출력이 있으면 지운다.

- [ ] **Step 3: 파일 크기 확인**

Run: `wc -l src/*.tsx src/state/*.tsx src/pages/*.tsx src/components/*.tsx | sort -n | tail -5`
Expected: 테스트 파일 제외 모든 파일 250줄 이하. 넘는 파일이 있으면 사용자에게 보고(억지로 쪼개지 말 것).

- [ ] **Step 4: 문서 갱신**

`grep -n "PlannerApp\|HomeScreen\|toStart\|atHome\|homeTab" ../docs/*.md`로 나온 줄마다 새 위치로 고친다. 규칙:
- `PlannerApp.tsx`의 화면 → 해당 `pages/*.tsx`
- `toStart()`/`restart()` 설명 → "`state/analysis.tsx`의 `restart()`는 로그인을 모른다. 로그아웃은 `state/auth.tsx`의 `logout()`이고 `pages/MyPage.tsx`만 부른다"
- `atHome`/`homeTab`/`tab` → "화면은 URL로 정해진다 (`App.tsx` 라우트 표)"
- `feature-guide-home-and-shell.md`에 라우트 표(spec 1절 표)를 그대로 한 절로 추가.

- [ ] **Step 5: 전체 자동 검증**

Run: `npx tsc -b && npx vite build && npx oxlint && npx vitest run`
Expected: 전부 통과. vitest 결과에 테스트 파일 6개(entry, auth, analysis, scan, CourseModalRoute, App) 모두 PASS.

- [ ] **Step 6: 브라우저 수동 확인 (claude-in-chrome 또는 직접)**

`npm run build && npx vite preview` (프로덕션 빌드, StrictMode 이중 실행 없는 상태)와 `npm run dev`(StrictMode) 양쪽에서:

| 확인 | 기대 |
|---|---|
| `/`, `/search`, `/saved`, `/my`, `/courses`, `/course/c1`, `/course/c1/live`, `/login`, `/start`, `/summary`, `/없는경로` 직접 접속 | 각 화면. 로그인 필요한 곳은 `/login?next=`. `/summary`는 결과 없으면 `/start`. 없는 경로는 `/` |
| 각 화면에서 뒤로/앞으로/새로고침 | 같은 화면 유지. 모달은 뒤로가기로 닫힘 |
| 로그인 상태에서 아무 화면의 '‹ 홈'·'처음으로'·'다시 분석'·'분석 취소' | **로그인 유지** (마이페이지에서 확인) |
| 마이페이지 로그아웃 | 홈으로, 로그인 버튼 다시 보임 |
| 백엔드 15분 이상 쉬게 한 뒤(또는 DevTools에서 `/auth/me` 차단) 앱 열기 | 로그인 화면으로 튕기지 않음 |
| 카카오 로그인 왕복 | 떠나기 전 화면으로 복귀 |
| 유튜브 연동 → 분석 → 결과 | 끊김 없이 `/scan` → `/summary` |
| 공유 링크: 공유 시트에서 복사한 `/course/<id>` 새 탭, 옛 형식 `/?course=<id>` | 둘 다 코스 상세 |
| 하단 탭 전환 | 활성 표시가 미끄러지고, 탭바 위치·여백이 master와 같음 |

결과(통과/실패 항목)를 사용자에게 그대로 보고.

- [ ] **Step 7: Commit**

```bash
git add -A src ../docs
git commit -m "refactor: PlannerApp 삭제 — 화면은 URL로, 상태는 state/*로

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

PR은 사용자가 요청할 때만 올린다 (`gh pr create --head refactor/frontend-pages --base master`).
