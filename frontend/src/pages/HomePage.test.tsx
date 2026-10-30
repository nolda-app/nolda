import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Place } from '../planner/geo'
import { ToastProvider } from '../state/toast'
import { AuthProvider } from '../state/auth'
import { CoursesProvider } from '../state/courses'
import { AnalysisProvider } from '../state/analysis'
import HomePage from './HomePage'
import { usePlaces } from './usePlaces'

vi.mock('./usePlaces', () => ({ usePlaces: vi.fn() }))
vi.mock('../planner/api', async (orig) => ({ ...(await orig<typeof import('../planner/api')>()), fetchMe: vi.fn(() => new Promise(() => {})) }))

const PLACES = [{ id: 'p1', name: '여기카페', kind: '카페', area: '성수', img: 'x.jpg' }] as Place[]
type State = Partial<ReturnType<typeof usePlaces>>
const setState = (s: State) => vi.mocked(usePlaces).mockReturnValue({ places: [], failed: false, waking: false, ready: false, ...s })

beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
})
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); setState({}) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <ToastProvider><AuthProvider><CoursesProvider><AnalysisProvider>
        <HomePage />
      </AnalysisProvider></CoursesProvider></AuthProvider></ToastProvider>
    </MemoryRouter>,
  )
}

describe('HomePage 콜드스타트', () => {
  it('홈에서만 재시도를 켠다', () => {
    renderHome()
    expect(usePlaces).toHaveBeenCalledWith({ retry: true })
  })

  it('로딩 중에는 마키 대신 스켈레톤 5개를 보여준다', () => {
    const { container } = renderHome()
    expect(container.querySelectorAll('.pl-marquee-skel .pl-pcard')).toHaveLength(5)
    expect(container.querySelector('.pl-marquee-track:not(.pl-marquee-skel)')).toBeNull()
  })

  it('장소를 받으면 스켈레톤이 사라지고 장소 카드가 나온다', () => {
    setState({ places: PLACES, ready: true })
    const { container } = renderHome()
    expect(container.querySelector('.pl-marquee-skel')).toBeNull()
    expect(screen.getAllByText('여기카페').length).toBeGreaterThan(0)
  })

  it('waking이면 서버를 깨우는 중이라는 안내를 보여준다', () => {
    setState({ waking: true })
    renderHome()
    expect(screen.getByRole('status').textContent).toContain('서버를 깨우는 중')
  })

  it('waking이어도 이미 받았거나 실패했으면 안내를 숨긴다', () => {
    setState({ waking: true, ready: true, places: PLACES })
    const { unmount } = renderHome()
    expect(screen.queryByRole('status')).toBeNull()
    unmount()
    setState({ waking: true, failed: true })
    renderHome()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('정상일 때는 안내도 실패 문구도 없다', () => {
    setState({ places: PLACES, ready: true })
    renderHome()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByText(/불러오지 못했어요/)).toBeNull()
  })

  it('실패하면 문구와 다시 시도 버튼을 보여주고, 누르면 새로고침한다', () => {
    setState({ failed: true })
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    renderHome()
    expect(screen.getByText(/장소를 불러오지 못했어요/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('서버 응답 전에도 정적 섹션(분위기 타일·코스 만들기)이 그려진다', () => {
    renderHome()
    expect(screen.getByText('이런 데이트도 좋아요')).toBeTruthy()
    expect(screen.getByRole('button', { name: /코스 만들기/ })).toBeTruthy()
  })
})
