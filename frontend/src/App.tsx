import { lazy, Suspense } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import type { Location } from 'react-router-dom'
import PlannerApp from './planner/PlannerApp'
import TabLayout from './pages/TabLayout'
import CoursesPage from './pages/CoursesPage'
import CourseModalRoute from './pages/CourseModalRoute'
import LivePage from './pages/LivePage'

// 개발 서버에서만: ?scan-demo 로 분석 화면 모션 미리보기 (배포 빌드에는 안 들어감)
const ScanDemo = import.meta.env.DEV ? lazy(() => import('./planner/ScanDemo')) : null

export default function App() {
  const location = useLocation()
  // 목록에서 연 상세는 목록 위에 모달로 — 배경 화면을 그대로 그린다
  const background = (location.state as { background?: Location } | null)?.background
  if (ScanDemo && new URLSearchParams(window.location.search).has('scan-demo')) {
    return <Suspense><ScanDemo /></Suspense>
  }
  return (
    <>
      <Routes location={background || location}>
        <Route element={<TabLayout />}>
          <Route path="/courses" element={<CoursesPage />} />
          {/* 링크로 바로 들어오면 코스 목록을 배경으로 깐다 */}
          <Route path="/course/:id" element={<><CoursesPage /><CourseModalRoute /></>} />
        </Route>
        <Route path="/course/:id/live" element={<LivePage />} />
        <Route path="*" element={<PlannerApp />} />
      </Routes>
      {background && (
        <Routes>
          <Route path="/course/:id" element={<CourseModalRoute />} />
        </Routes>
      )}
    </>
  )
}
