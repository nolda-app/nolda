import type { PhotoMeta } from './photoMeta'
import type { Cond, Course } from './data'
import type { Taste } from './logic'

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '')

export interface AiCourseRequest {
  taste: Taste
  tags: string[]
  intent: string | null
  cond: Cond
  /** 동적 주제에서 고른 답 — 주제 이름·고른 라벨·반영 방법 */
  picked: { name: string; labels: string[]; hint: string }[]
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

/** taste.py가 만든 동적 주제 1개 */
export interface TasteTopic {
  key: string
  name: string
  multi: boolean
  hint: string
  evidence: string
  opts: { v: string; l: string; mood: string | null; spend: string | null; tag: string | null }[]
}

/** 백엔드 POST /taste/analyze — 사진(6) + 유튜브(4)를 LLM이 직접 분석 */
export interface TasteProfile {
  source: 'llm'
  fixed: { crowd: string; hour: string; pace: string; plan: string; companion: string }
  evidence: Record<string, string>
  tags: string[]
  highlights: string[]
  topics: TasteTopic[]
  photo: { total: number; days: number; party: number }
  youtube: { likes: number; subs: number }
}

export async function analyzeTaste(
  body: { yt_id: string | null; photos: PhotoMeta[] },
  signal?: AbortSignal,
): Promise<TasteProfile> {
  if (!BASE) throw new Error('VITE_API_BASE_URL이 설정되지 않았어요')
  let res: Response
  try {
    res = await fetch(`${BASE}/taste/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new Error('백엔드 서버에 연결하지 못했어요')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || `취향 분석 실패 (HTTP ${res.status})`)
  return data as TasteProfile
}

/** 백엔드 POST /walk — 내 위치 → 다음 목적지 보행자 경로 + 회전 안내 */
export interface WalkStep { mark: string; text: string; meters: number; lat: number; lng: number }
export interface WalkRoute {
  source: 'tmap' | 'straight'
  path: [number, number][]
  meters: number
  minutes: number
  steps: WalkStep[]
}

export async function fetchWalk(
  body: { start: [number, number]; end: [number, number]; end_name: string },
  signal?: AbortSignal,
): Promise<WalkRoute> {
  if (!BASE) throw new Error('VITE_API_BASE_URL이 설정되지 않았어요')
  const res = await fetch(`${BASE}/walk`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  })
  if (!res.ok) throw new Error(`길안내를 불러오지 못했어요 (HTTP ${res.status})`)
  return (await res.json()) as WalkRoute
}
