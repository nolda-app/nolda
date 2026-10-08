// 분석 진행 — 기록 읽기 진행률 타이머 + 백엔드 LLM 분석을 함께 돌리고, 둘 다 끝나면 결과를 발표한다.
// 시작은 버튼 핸들러·진입 처리에서 start()로 부른다 (페이지 마운트 effect로 시작하면 StrictMode에서 두 번 돈다)
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyzeTaste, fetchYoutubeTaste, youtubeAuthorizeUrl } from '../planner/api'
import type { TasteProfile, YoutubeTaste } from '../planner/api'
import { analyzeYoutubeOnly, reportFromProfile, scanSteps } from '../planner/logic'
import type { Sources, Taste } from '../planner/logic'
import { readPhotos } from '../planner/photoMeta'
import { stashPhotos } from '../planner/photoStash'
import { savePending } from '../entry'
import { useAnalysis } from './analysis'

export const SCAN_STEP_MS = 280 // 기록 하나를 읽는 간격 (진행률)
export const SCAN_INTAKE_MS = 1300 // 분석 중 화면을 최소한 보여주는 시간
export const SCENE_LAUNCH_MS = 700 // '취향 분석 시작'을 누른 뒤 카드가 모이는 장면 길이 (planner.css sg-fan.is-launch)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface ScanResult { tags: string[]; taste: Taste }
export interface Scan {
  active: boolean
  src: Sources
  yt: YoutubeTaste | null
  scanN: number
  ytLoading: boolean
  ready: ScanResult | null
  photoUrls: string[]
  start: (src: Sources, files: File[], ytId: string | null, opts?: { replace?: boolean }) => void
  cancel: () => void
  /** '결과 보기' — 요약 화면으로 */
  reveal: () => void
}

const Ctx = createContext<Scan | null>(null)

export function ScanProvider({ children }: { children: ReactNode }) {
  const a = useAnalysis()
  const navigate = useNavigate()
  const [active, setActive] = useState(false)
  const [scanN, setScanN] = useState(0)
  const [ytLoading, setYtLoading] = useState(false)
  const [ready, setReady] = useState<ScanResult | null>(null)
  const [files, setFiles] = useState<File[]>([])
  // 타이머 콜백이 옛 state를 보지 않도록 이번 분석 값은 ref로
  const run = useRef<{ src: Sources; yt: YoutubeTaste | null }>({ src: { youtube: false, photos: false }, yt: null })
  const profile = useRef<Promise<TasteProfile | null> | null>(null)
  const timer = useRef<number | null>(null)
  const t0 = useRef(0)
  const finished = useRef(false)
  const token = useRef(0) // 취소·재시작하면 바뀜 — 늦게 끝난 이전 분석이 화면을 넘기지 못하게
  const go = useRef<(() => void) | null>(null)

  const photoUrls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => { photoUrls.forEach((u) => URL.revokeObjectURL(u)) }, [photoUrls])
  const stopTimer = () => { if (timer.current) clearInterval(timer.current); timer.current = null }
  useEffect(() => stopTimer, [])

  const finish = async () => {
    if (finished.current) return
    finished.current = true
    stopTimer()
    const mine = token.current
    const still = () => mine === token.current
    const motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const [prof] = await Promise.all([profile.current, motion ? sleep(SCAN_INTAKE_MS) : null]) // 빨리 끝나도 잠깐은 보여줌
    if (!still()) return
    // LLM 분석이 실패하면 유튜브 키워드 규칙만으로 (사진은 흉내 내지 않는다 — 가짜 결과가 되므로)
    const r = prof
      ? reportFromProfile(prof)
      : analyzeYoutubeOnly(run.current.yt, run.current.yt ? '취향 분석에 실패해 유튜브 기록만으로 대략 맞췄어요' : '취향 분석에 실패해 기본값으로 맞췄어요')
    setReady({ tags: r.tags, taste: r.taste })
    await new Promise<void>((res) => { go.current = res })
    go.current = null
    if (!still()) return
    a.setResult(r)
    setActive(false); setReady(null)
    navigate('/summary', { replace: true })
  }

  /** 사진을 읽어(EXIF·축소) 유튜브 집계와 함께 백엔드로 — 실패하면 null이라 폴백으로 */
  const startProfile = (src: Sources, ytId: string | null, fs: File[]) => {
    profile.current = (src.photos && fs.length ? readPhotos(fs) : Promise.resolve([]))
      .then((photos) => (photos.length || ytId ? analyzeTaste({ yt_id: ytId, photos }) : null))
      .catch((e: Error) => { a.setScanError(e.message); return null })
  }

  const runScan = (src: Sources, yt: YoutubeTaste | null, photoCount: number) => {
    run.current = { src, yt }
    finished.current = false
    setScanN(0)
    stopTimer()
    const total = scanSteps(src, yt, photoCount)
    if (!total) { void finish(); return }
    t0.current = Date.now()
    timer.current = window.setInterval(() => {
      setScanN((n) => {
        const next = Math.max(n + 1, Math.min(total, Math.floor((Date.now() - t0.current) / SCAN_STEP_MS)))
        if (next >= total) { stopTimer(); void finish() }
        return next
      })
    }, SCAN_STEP_MS)
  }

  const start: Scan['start'] = (src, fs, ytId, opts) => {
    if (!src.youtube && !src.photos) return
    a.setScanError('')
    // 처음 연동이면 구글로 떠난다 → 백엔드가 집계 후 /?yt=<id>로 돌려보냄 (EntryHandler가 이어서 start)
    if (src.youtube && !ytId) {
      try {
        const url = youtubeAuthorizeUrl()
        savePending(src)
        // 고른 사진은 기기 안(IndexedDB)에 보관했다가 돌아와서 복원
        void (src.photos ? stashPhotos(fs) : Promise.resolve()).then(() => { window.location.href = url })
      } catch (e) {
        a.setScanError((e as Error).message)
      }
      return
    }
    token.current++
    setActive(true); setReady(null); setFiles(fs)
    a.patch({ swipes: [] })
    run.current = { src, yt: null }
    navigate('/scan', { replace: opts?.replace })
    if (!src.youtube) { startProfile(src, null, fs); runScan(src, null, fs.length); return }
    const mine = token.current
    setYtLoading(true)
    fetchYoutubeTaste(ytId!)
      .then((data) => { if (mine !== token.current) return; startProfile(src, ytId, fs); runScan(src, data, fs.length) })
      .catch(() => {
        if (mine !== token.current) return
        a.setYtId(null); a.setScanError('유튜브 연동이 만료됐어요. 다시 연결해 주세요')
        setActive(false); navigate('/start', { replace: true })
      })
      .finally(() => setYtLoading(false))
  }

  const cancel = () => {
    stopTimer()
    token.current++
    go.current = null
    setActive(false); setReady(null); setScanN(0)
  }

  // 다른 앱에 갔다 오면 타이머가 멈춰 있을 수 있다 — 돌아오면 바로 마무리
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && active && !ytLoading && timer.current) void finish()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  })

  const value: Scan = { active, src: run.current.src, yt: run.current.yt, scanN, ytLoading, ready, photoUrls, start, cancel, reveal: () => go.current?.() }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useScan(): Scan {
  const v = useContext(Ctx)
  if (!v) throw new Error('useScan은 ScanProvider 안에서만')
  return v
}
