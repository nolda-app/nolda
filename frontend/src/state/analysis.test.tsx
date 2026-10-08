import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ToastProvider } from './toast'
import { AuthProvider } from './auth'
import { CoursesProvider } from './courses'
import { AnalysisProvider, RequireReport, useAnalysis } from './analysis'
import type { Report } from '../planner/logic'
import type { Course } from '../planner/data'
import { fetchAiCourses } from '../planner/api'

vi.mock('../planner/api', async (orig) => ({ ...(await orig<typeof import('../planner/api')>()), fetchAiCourses: vi.fn() }))
const mockAi = vi.mocked(fetchAiCourses)

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

describe('오래된 AI 요청', () => {
  it('요청 중에 setResult로 분석을 다시 하면 늦게 온 응답은 버린다', async () => {
    let resolve!: (l: Course[]) => void
    mockAi.mockReturnValue(new Promise<Course[]>((r) => { resolve = r }))
    renderAt('/x')
    act(() => a.setResult(REPORT))
    act(() => a.generateAi())
    act(() => a.setResult(REPORT))
    await act(async () => { resolve([{ id: 'stale' } as Course]) })
    expect(a.ai.status).toBe('idle')
    expect(a.ai.ids).toEqual([])
  })
  it('finish는 이미 만든 코스를 비워 취향을 바꾸면 다시 만들게 한다', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ report: REPORT, ai: { status: 'done', ids: ['c1'], error: '' } }))
    renderAt('/x')
    act(() => a.finish())
    expect(a.ai.status).toBe('idle')
    expect(a.ai.ids).toEqual([])
  })
})
