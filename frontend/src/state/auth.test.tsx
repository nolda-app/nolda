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
