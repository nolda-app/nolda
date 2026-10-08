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
export const PENDING_KEY = 'nolda:yt-pending'

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
