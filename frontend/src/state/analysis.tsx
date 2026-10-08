// 취향 분석 결과와 코스 조건 — 이 탭을 닫기 전까지 새로고침해도 유지(sessionStorage)
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { fetchAiCourses } from '../planner/api'
import { COURSES, DEFAULT_COND } from '../planner/data'
import type { Cond } from '../planner/data'
import { applyPicks, build } from '../planner/logic'
import type { BuiltCourse, Picks, Report, Sources, Taste } from '../planner/logic'
import type { Swipe } from '../planner/tasteType'
import { useCourses } from './courses'

export interface AiState { status: 'idle' | 'loading' | 'done' | 'error'; ids: string[]; error: string }
const AI_IDLE: AiState = { status: 'idle', ids: [], error: '' }

/* 시간대 막대 기본값 — 시작 시각의 4구간(아침·낮·노을 무렵·밤) */
export const HOUR_DEFAULT: Record<string, [number, number]> = { morning: [9, 11], noon: [12, 15], sunset: [16, 19], night: [19, 22] }
export const hourBucket = (h: number) => (h < 11 ? 'morning' : h < 16 ? 'noon' : h < 19 ? 'sunset' : 'night') // logic.ts analyze 기준과 같음

interface Saved {
  report: Report | null
  skipped: boolean // '연결 없이 둘러보기' — 기본 취향으로 코스를 만든다
  taste: Taste
  tags: string[]
  picks: Picks // 동적 주제에서 고른 답 (주제 key → 옵션 값들)
  intent: string | null
  hourRange: [number, number] | null // 안 건드렸으면 시간대 구간 기본값
  swipes: Swipe[] // 분석 중 미니 게임에서 고른 장소
  cond: Cond
  ai: AiState
}
const EMPTY: Saved = { report: null, skipped: false, taste: {}, tags: [], picks: {}, intent: null, hourRange: null, swipes: [], cond: { ...DEFAULT_COND }, ai: AI_IDLE }
const KEY = 'nolda:analysis'
const YT_ID_KEY = 'nolda:yt-id' // 유튜브 집계 결과 id — 한 번 연동하면 로그아웃 전까지 구글을 다시 거치지 않는다

function load(): Saved {
  try {
    const p = JSON.parse(sessionStorage.getItem(KEY) || 'null')
    if (!p || typeof p !== 'object') return EMPTY
    // 생성 중에 새로고침했으면 요청은 이미 끊겼다 — 다시 만들게 idle로
    return { ...EMPTY, ...p, ai: p.ai && p.ai.status !== 'loading' ? p.ai : AI_IDLE }
  } catch {
    return EMPTY
  }
}

export interface Analysis extends Saved {
  patch: (o: Partial<Saved>) => void
  hasResult: boolean
  range: [number, number]
  setHourRange: (r: [number, number]) => void
  effTaste: Taste
  effTags: string[]
  setResult: (r: Report) => void
  skip: () => void
  finish: () => void
  restart: () => void
  generateAi: () => void
  // 아래는 저장하지 않는다 (File은 직렬화 불가, 오류 문구는 일시적)
  sources: Sources
  setSources: (fn: (s: Sources) => Sources) => void
  photoFiles: File[]
  setPhotoFiles: (f: File[]) => void
  scanError: string
  setScanError: (m: string) => void
  ytId: string | null
  setYtId: (id: string | null) => void
}

const Ctx = createContext<Analysis | null>(null)

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const courses = useCourses()
  const [st, setSt] = useState<Saved>(load)
  const patch = (o: Partial<Saved>) => setSt((s) => ({ ...s, ...o }))
  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify(st)) } catch { /* 이번 화면만 */ }
  }, [st])

  const [sources, setSourcesState] = useState<Sources>({ youtube: true, photos: false })
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [scanError, setScanError] = useState('')
  const [ytId, setYtIdState] = useState<string | null>(() => { try { return localStorage.getItem(YT_ID_KEY) } catch { return null } })
  const setYtId = (id: string | null) => {
    setYtIdState(id)
    try { id ? localStorage.setItem(YT_ID_KEY, id) : localStorage.removeItem(YT_ID_KEY) } catch { /* 이번 세션만 */ }
  }

  const range: [number, number] = st.hourRange ?? HOUR_DEFAULT[st.taste.hour || 'noon'] ?? [12, 15]
  // 동적 주제에서 고른 답 → 코스 점수·프롬프트에 쓸 값 (고른 게 없으면 분석값 그대로)
  const derived = useMemo(() => applyPicks(st.report?.topics || [], st.picks, st.tags), [st.report, st.picks, st.tags])
  // useMemo 필수 — 매 렌더 새 객체면 builtAll이 계속 재계산돼 코스 시작 지도가 다시 그려진다
  const effTaste: Taste = useMemo(
    () => ({ ...st.taste, mood: derived.mood ?? st.taste.mood, spend: derived.spend ?? st.taste.spend }),
    [st.taste, derived.mood, derived.spend],
  )
  const swipePicked = useMemo(() => {
    const liked = st.swipes.filter((x) => x.liked), nope = st.swipes.filter((x) => !x.liked)
    const label = (x: Swipe) => `${x.name}(${x.kind})`
    return [
      ...(liked.length ? [{ name: '분석 중 마음에 든 장소', labels: liked.map(label), hint: '이 장소들과 종류·분위기가 비슷한 곳을 우선한다' }] : []),
      ...(nope.length ? [{ name: '분석 중 별로라고 한 장소', labels: nope.map(label), hint: '이 장소들과 비슷한 곳은 되도록 피한다' }] : []),
    ]
  }, [st.swipes])

  const aiAbort = useRef<AbortController | null>(null)
  useEffect(() => () => aiAbort.current?.abort(), [])
  const generateAi = () => {
    aiAbort.current?.abort()
    const ctrl = new AbortController()
    aiAbort.current = ctrl
    setSt((s) => ({ ...s, ai: { ...s.ai, status: 'loading', error: '' } }))
    fetchAiCourses(
      { taste: effTaste, tags: derived.tags, intent: st.intent, picked: [...derived.picked, ...swipePicked], cond: st.cond, time_window: { start: range[0], end: range[1] } },
      ctrl.signal,
    )
      .then((list) => {
        if (ctrl.signal.aborted) return
        courses.addCourses(list)
        patch({ ai: { status: 'done', ids: list.map((c) => c.id), error: '' } })
      })
      .catch((e: Error) => {
        if (!ctrl.signal.aborted) setSt((s) => ({ ...s, ai: { ...s.ai, status: 'error', error: e.message } }))
      })
  }

  const value: Analysis = {
    ...st, patch, range, effTaste, effTags: derived.tags,
    hasResult: !!st.report || st.skipped,
    setHourRange: (r) => setSt((s) => ({ ...s, hourRange: r, taste: { ...s.taste, hour: hourBucket(r[0]) } })),
    setResult: (r) => { aiAbort.current?.abort(); setSt((s) => ({
      ...s, report: r, skipped: false, taste: r.taste, tags: r.tags, picks: {}, ai: AI_IDLE,
      cond: { ...s.cond, people: r.party, budget: r.budgetBand },
    })) },
    skip: () => { aiAbort.current?.abort(); setSt((s) => ({ ...s, report: null, skipped: true, taste: { mood: 'calm', crowd: 'mid', hour: 'noon', spend: 'cafe', pace: 'mid' }, tags: [], ai: AI_IDLE })) },
    // 혼자·연인이면 인원 조건도 맞춤 (친구·가족·동료는 인원이 제각각이라 그대로)
    finish: () => {
      const people = st.taste.companion === 'solo' ? 1 : st.taste.companion === 'couple' ? 2 : 0
      // 요약에서 취향을 바꾸고 다시 오면 이전 코스를 버리고 새로 만들게 한다
      aiAbort.current?.abort()
      setSt((s) => ({ ...s, ai: AI_IDLE, cond: people ? { ...s.cond, people } : s.cond }))
    },
    // 분석을 처음부터 — 로그인·유튜브 연동은 건드리지 않는다
    restart: () => { aiAbort.current?.abort(); setSt(EMPTY); setScanError('') },
    generateAi,
    sources, setSources: (fn) => setSourcesState(fn), photoFiles, setPhotoFiles, scanError, setScanError, ytId, setYtId,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAnalysis(): Analysis {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAnalysis는 AnalysisProvider 안에서만')
  return v
}

/** 취향을 반영해 계산한 코스들. list = 지금 목록에 보일 것 */
export function useBuilt() {
  const a = useAnalysis()
  const c = useCourses()
  const builtAll: BuiltCourse[] = useMemo(
    () => [...Object.values(c.pool), ...COURSES].map((x) => build(x, { taste: a.effTaste, tags: a.effTags, intent: a.intent, people: a.cond.people, booked: c.booked })),
    [c.pool, a.effTaste, a.effTags, a.intent, a.cond.people, c.booked],
  )
  const list = useMemo(() => {
    const fixed = new Set(COURSES.map((x) => x.id))
    // 분석 전이거나 AI가 실패했으면 고정 코스로 (화면이 텅 비지 않게)
    if (!a.hasResult || a.ai.status === 'error') return builtAll.filter((x) => fixed.has(x.id))
    return a.ai.ids.map((id) => builtAll.find((x) => x.id === id)).filter(Boolean) as BuiltCourse[]
  }, [builtAll, a.hasResult, a.ai.status, a.ai.ids])
  const getBuilt = (id: string) => builtAll.find((x) => x.id === id) || null
  return { builtAll, list, getBuilt }
}

/** 분석 결과가 있어야 보이는 화면 — 없으면 데이터 고르기로 */
export function RequireReport({ children }: { children: ReactNode }) {
  return useAnalysis().report ? children : <Navigate to="/start" replace />
}
