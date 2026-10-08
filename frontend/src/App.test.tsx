import { StrictMode } from 'react'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { fetchMe, fetchYoutubeTaste } from './planner/api'
import { ToastProvider } from './state/toast'
import { AuthProvider } from './state/auth'
import { CoursesProvider } from './state/courses'
import { AnalysisProvider } from './state/analysis'
import { ScanProvider } from './state/scan'
import { EntryHandler } from './App'

vi.mock('./planner/api', async (orig) => ({ ...(await orig<typeof import('./planner/api')>()), fetchMe: vi.fn(() => new Promise(() => {})), fetchYoutubeTaste: vi.fn() }))
beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
})
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.mocked(fetchMe).mockClear(); vi.mocked(fetchYoutubeTaste).mockReset() })
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
