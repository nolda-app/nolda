import type { Cond, Course } from './data'
import type { Taste } from './logic'

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '')

export interface AiCourseRequest {
  taste: Taste
  tags: string[]
  intent: string | null
  cond: Cond
  /** 시작·종료 시각(시) — 이 시간을 꽉 채우는 코스만 받음 */
  time_window: { start: number; end: number }
}

/** 백엔드 POST /courses — 취향·조건으로 AI 코스 생성 (수십 초 걸릴 수 있음) */
export async function fetchAiCourses(req: AiCourseRequest, signal?: AbortSignal): Promise<Course[]> {
  if (!BASE) throw new Error('VITE_API_BASE_URL이 설정되지 않았어요')
  let res: Response
  try {
    res = await fetch(`${BASE}/courses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new Error('백엔드 서버에 연결하지 못했어요')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || `코스 생성 실패 (HTTP ${res.status})`)
  return data.courses as Course[]
}

export interface YoutubeTaste {
  likes: number
  subs: number
  categories: { name: string; ratio: number }[]
  channels: string[]
  sub_channels: string[]
  tags: string[]
  topics: string[]
  titles: string[]
  /** 키워드 규칙으로 뽑은 취향 힌트 (기록이 적으면 null) */
  hints: {
    mood: string | null
    spend: string | null
    pace: string | null
    tags: string[]
    evidence: { mood: string; spend: string; pace: string; tags: string }
  }
}

/** 백엔드 구글 로그인 주소 — 로그인 후 백엔드가 좋아요·구독을 집계하고 프론트로 ?yt=<id> 붙여 돌려보냄 */
export function youtubeLoginUrl() {
  if (!BASE) throw new Error('VITE_API_BASE_URL이 설정되지 않았어요')
  return `${BASE}/auth/youtube/login`
}

/** 백엔드 GET /youtube/taste/{id} — 유튜브 좋아요·구독 집계 결과 */
export async function fetchYoutubeTaste(id: string): Promise<YoutubeTaste> {
  if (!BASE) throw new Error('VITE_API_BASE_URL이 설정되지 않았어요')
  let res: Response
  try {
    res = await fetch(`${BASE}/youtube/taste/${encodeURIComponent(id)}`)
  } catch {
    throw new Error('백엔드 서버에 연결하지 못했어요')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || `유튜브 분석 결과를 가져오지 못했어요 (HTTP ${res.status})`)
  return data as YoutubeTaste
}
