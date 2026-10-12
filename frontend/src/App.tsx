import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import type { Location } from 'react-router-dom'
import SplashScreen from './planner/SplashScreen'
import { loadPlaces } from './planner/geo'
import { takePhotos } from './planner/photoStash'
import { readEntry, takePending, takeReturnTo } from './entry'
import { RequireAuth, useAuth } from './state/auth'
import { RequireReport, useAnalysis } from './state/analysis'
import { useScan } from './state/scan'
import TabLayout from './pages/TabLayout'
import HomePage from './pages/HomePage'
import SearchPage from './pages/SearchPage'
import SavedPage from './pages/SavedPage'
import MyPage from './pages/MyPage'
import CoursesPage from './pages/CoursesPage'
import CourseModalRoute from './pages/CourseModalRoute'
import LivePage from './pages/LivePage'
import LoginPage from './pages/LoginPage'
import DataSourcePage from './pages/DataSourcePage'
import ScanPage from './pages/ScanPage'
import SummaryPage from './pages/SummaryPage'

// 개발 서버에서만: ?scan-demo 로 분석 화면 모션 미리보기 (배포 빌드에는 안 들어감)
const ScanDemo = import.meta.env.DEV ? lazy(() => import('./planner/ScanDemo')) : null
const SPLASH_KEY = 'nolda:splashed'

/** 소셜 로그인·유튜브 연동에서 돌아온 쿼리를 처리하고 갈 곳으로 replace. 처리 중엔 아무것도 안 그린다 */
export function EntryHandler({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const auth = useAuth()
  const a = useAnalysis()
  const scan = useScan()
  const [entry] = useState(() => readEntry(location.search))
  // 처리가 끝나 주소가 실제로 바뀔 때까지는 아무것도 안 그린다 (처리 전 주소로 홈이 한 프레임 보이지 않게)
  const [startKey] = useState(location.key)
  const done = useRef(false) // StrictMode에서 effect가 두 번 돌아도 한 번만

  useEffect(() => {
    if (done.current || entry.kind === 'none') return
    done.current = true
    const to = (path: string) => { void navigate(path, { replace: true }) }
    switch (entry.kind) {
      case 'login': auth.signIn(entry.token); return to(takeReturnTo())
      case 'loginError': return to('/login?error=' + encodeURIComponent(entry.message))
      case 'course': return to('/course/' + encodeURIComponent(entry.id))
      case 'youtubeError': a.setScanError(entry.message); return to('/start')
      case 'youtube': {
        // 고른 소스·사진을 되살려 바로 분석 시작 (사진 복원에 실패하면 유튜브만으로)
        const src = takePending() || { youtube: true, photos: false }
        a.setYtId(entry.id)
        void (src.photos ? takePhotos() : Promise.resolve([] as File[])).then((files) => {
          const s = { ...src, photos: src.photos && files.length > 0 }
          a.setSources(() => s); a.setPhotoFiles(files)
          scan.start(s, files, entry.id, { replace: true })
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 앱 진입 때 한 번
  }, [])

  return entry.kind !== 'none' && location.key === startKey ? null : children
}

export default function App() {
  const location = useLocation()
  // 목록에서 연 상세는 목록 위에 모달로 — 배경 화면을 그대로 그린다
  const background = (location.state as { background?: Location } | null)?.background
  // 앱을 연 직후 로고 (탭당 1회). 소셜 로그인 등에서 돌아온 경우엔 건너뜀
  const [splash, setSplash] = useState(() => {
    try { return !location.search && !sessionStorage.getItem(SPLASH_KEY) } catch { return false }
  })
  const endSplash = () => { try { sessionStorage.setItem(SPLASH_KEY, '1') } catch { /* 다음에도 보임 */ } setSplash(false) }
  // 장소 데이터를 받은 뒤 한 번 다시 그려서 지도 핀·장소 정보가 보이게
  const [, setPlacesReady] = useState(false)
  useEffect(() => { loadPlaces().then(() => setPlacesReady(true)).catch((e: Error) => console.error('[places]', e.message)) }, [])

  if (ScanDemo && new URLSearchParams(location.search).has('scan-demo')) return <Suspense><ScanDemo /></Suspense>
  if (splash) return <SplashScreen onDone={endSplash} />
  return (
    <EntryHandler>
      <Routes location={background || location}>
        <Route element={<TabLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/saved" element={<SavedPage />} />
          <Route path="/my" element={<MyPage />} />
          <Route path="/courses" element={<CoursesPage />} />
          {/* 링크로 바로 들어오면 코스 목록을 배경으로 깐다 */}
          <Route path="/course/:id" element={<><CoursesPage /><CourseModalRoute /></>} />
        </Route>
        <Route path="/course/:id/live" element={<LivePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/start" element={<RequireAuth><DataSourcePage /></RequireAuth>} />
        <Route path="/scan" element={<RequireAuth><ScanPage /></RequireAuth>} />
        <Route path="/summary" element={<RequireAuth><RequireReport><SummaryPage /></RequireReport></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {background && (
        <Routes>
          <Route path="/course/:id" element={<CourseModalRoute />} />
        </Routes>
      )}
    </EntryHandler>
  )
}
