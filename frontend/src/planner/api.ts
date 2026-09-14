import type { Cond, Course } from './data'
import type { Taste } from './logic'

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '')

export interface AiCourseRequest {
  taste: Taste
  tags: string[]
  intent: string | null
  cond: Cond
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
