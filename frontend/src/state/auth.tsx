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
  // navigate는 주소가 바뀔 때마다 새로 만들어진다 — effect 의존성에 넣으면 페이지 이동마다 /auth/me를 다시 부른다
  const nav = useRef(navigate)
  useEffect(() => { nav.current = navigate })

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
          nav.current('/login?error=' + encodeURIComponent('로그인 확인에 실패했어요. 다시 시도해 주세요.'), { replace: true })
        }
      })
    return () => { alive = false }
  }, [token, clear])

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
