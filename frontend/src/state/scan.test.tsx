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
