// 받은 코스 원본(aiPool)·저장한 코스·예약 요청 — 화면과 무관하게 앱 전체가 공유
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { COURSES } from '../planner/data'
import type { Course } from '../planner/data'
import { deleteSavedCourse, fetchSavedCourses, guestId, mergeGuestSaved, putSavedCourse } from '../planner/api'
import { useAuth } from './auth'
import { useToast } from './toast'

const SAVED_KEY = 'nolda:saved-courses' // 저장한 코스(Course 전체) — 새로고침·로그인 없이도 유지
const POOL_KEY = 'nolda:ai-pool' // 이번 탭에서 받은 AI 코스 — 새로고침해도 목록·상세가 유지되게

interface Courses {
  pool: Record<string, Course>
  saved: string[]
  savedCourses: Course[]
  booked: string[]
  addCourses: (list: Course[]) => void
  toggleSave: (id: string) => void
  toggleBook: (key: string) => void
}

const Ctx = createContext<Courses | null>(null)
const readJson = <T,>(s: Storage, k: string, fallback: T): T => {
  try { return (JSON.parse(s.getItem(k) || 'null') as T) ?? fallback } catch { return fallback }
}
const byId = (list: Course[]) => Object.fromEntries(list.map((c) => [c.id, c]))

export function CoursesProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const toast = useToast()
  const [savedInit] = useState(() => readJson<Course[]>(localStorage, SAVED_KEY, []))
  const [pool, setPool] = useState<Record<string, Course>>(() => ({ ...readJson(sessionStorage, POOL_KEY, {}), ...byId(savedInit) }))
  const [saved, setSaved] = useState<string[]>(() => savedInit.map((c) => c.id))
  const [booked, setBooked] = useState<string[]>([])

  const savedCourses = useMemo(
    () => saved.map((id) => pool[id] || COURSES.find((c) => c.id === id)).filter(Boolean) as Course[],
    [saved, pool],
  )
  useEffect(() => {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(savedCourses)) } catch { /* 저장 공간 없음 — 이번 세션만 */ }
  }, [savedCourses])
  useEffect(() => {
    try { sessionStorage.setItem(POOL_KEY, JSON.stringify(pool)) } catch { /* 이번 화면만 */ }
  }, [pool])

  // 로그인 없이 쓰는 사람의 저장도 서버에 남긴다 (예전에 이 기기에만 저장해 둔 것 포함, 여러 번 보내도 같은 결과)
  useEffect(() => {
    if (token || !guestId()) return
    savedInit.forEach((c) => putSavedCourse(null, c.id).catch((e: Error) => console.error('[saved]', e.message)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 한 번
  }, [])

  // 로그인하면 게스트로 저장해 둔 코스를 계정으로 합치고, DB에 저장해 둔 코스를 가져와 합침
  useEffect(() => {
    if (!token) return
    mergeGuestSaved(token)
      .catch((e: Error) => console.error('[saved]', e.message)) // 합치지 못해도 계정의 저장 목록은 가져온다
      .then(() => fetchSavedCourses(token))
      .then((list) => {
        setPool((p) => ({ ...p, ...byId(list) }))
        setSaved((s) => [...s, ...list.map((c) => c.id).filter((id) => !s.includes(id))])
      })
      .catch((e: Error) => console.error('[saved]', e.message))
  }, [token])

  const value: Courses = {
    pool, saved, savedCourses, booked,
    addCourses: (list) => setPool((p) => ({ ...p, ...byId(list) })),
    toggleSave: (id) => {
      const on = !saved.includes(id)
      setSaved((s) => (on ? s.concat([id]) : s.filter((x) => x !== id)))
      toast(on ? '저장한 코스에 담았어요' : '저장을 취소했어요')
      // 로그인했으면 계정에, 아니면 게스트 ID로 서버에 남긴다. 로그인 사용자는 DB에 있는 코스만 (기본 코스는 게스트 기록에만)
      if (token ? pool[id]?.shareable : guestId()) {
        (on ? putSavedCourse(token, id) : deleteSavedCourse(token, id))
          .catch((e: Error) => console.error('[saved]', e.message)) // 서버 저장이 안 돼도 이 기기엔 남아 있음
      }
    },
    toggleBook: (key) => setBooked((b) => (b.includes(key) ? b.filter((x) => x !== key) : b.concat([key]))),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCourses(): Courses {
  const v = useContext(Ctx)
  if (!v) throw new Error('useCourses는 CoursesProvider 안에서만')
  return v
}
