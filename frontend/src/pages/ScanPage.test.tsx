import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { analyzeTaste } from '../planner/api'
import { ToastProvider } from '../state/toast'
import { AuthProvider } from '../state/auth'
import { CoursesProvider } from '../state/courses'
import { AnalysisProvider } from '../state/analysis'
import { ScanProvider, useScan } from '../state/scan'
import ScanPage from './ScanPage'

vi.mock('../planner/api', async (orig) => ({ ...(await orig<typeof import('../planner/api')>()), analyzeTaste: vi.fn(), fetchMe: vi.fn(() => new Promise(() => {})) }))
vi.mock('../planner/photoMeta', async (orig) => ({ ...(await orig<typeof import('../planner/photoMeta')>()), readPhotos: vi.fn(async () => [{}] as never) }))

let s: ReturnType<typeof useScan>
function Grab() { s = useScan(); return null }
function Where() { return <div data-testid="where">{useLocation().pathname}</div> }

beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
})
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); vi.mocked(analyzeTaste).mockReset() })
afterEach(cleanup)

function renderApp(at: string) {
  render(
    <MemoryRouter initialEntries={[at]}>
      <ToastProvider><AuthProvider><CoursesProvider><AnalysisProvider><ScanProvider>
        <Grab /><Where />
        <Routes>
          <Route path="/start" element={<div>START</div>} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/summary" element={<div>SUMMARY</div>} />
        </Routes>
      </ScanProvider></AnalysisProvider></CoursesProvider></AuthProvider></ToastProvider>
    </MemoryRouter>,
  )
}

describe('ScanPage', () => {
  it('분석이 안 돌고 있는데 /scan으로 들어오면 /start로', async () => {
    renderApp('/scan')
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/start'))
  })
  it('분석이 끝나 결과를 공개하면 /start로 튕기지 않고 /summary에 남는다', async () => {
    vi.mocked(analyzeTaste).mockResolvedValue(null as never)
    renderApp('/start')
    act(() => s.start({ youtube: false, photos: true }, [new File(['x'], 'a.jpg', { type: 'image/jpeg' })], null))
    expect(screen.getByTestId('where').textContent).toBe('/scan')
    await waitFor(() => expect(s.ready).not.toBeNull(), { timeout: 3000 })
    act(() => s.reveal())
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.getByTestId('where').textContent).toBe('/summary')
    expect(screen.getByText('SUMMARY')).toBeTruthy()
  })
})
