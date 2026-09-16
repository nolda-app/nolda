import { lazy, Suspense } from 'react'
import PlannerApp from './planner/PlannerApp'

// 개발 서버에서만: ?scan-demo 로 분석 화면 모션 미리보기 (배포 빌드에는 안 들어감)
const ScanDemo = import.meta.env.DEV ? lazy(() => import('./planner/ScanDemo')) : null

function App() {
  if (ScanDemo && new URLSearchParams(window.location.search).has('scan-demo')) {
    return <Suspense><ScanDemo /></Suspense>
  }
  return <PlannerApp />
}

export default App
