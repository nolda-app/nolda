// 하단 탭바가 있는 화면들의 공통 틀 — 탭바가 화면 전환 사이에도 그대로 있어서 활성 표시가 미끄러져 따라간다
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import BottomTabs from '../planner/BottomTabs'
import type { HomeTab } from '../planner/BottomTabs'
import { useCourses } from '../state/courses'

const PATH: Record<HomeTab, string> = { home: '/', course: '/courses', search: '/search', saved: '/saved', my: '/my' }

export function tabOf(pathname: string): HomeTab | null {
  if (pathname === '/') return 'home'
  if (pathname === '/courses' || pathname.startsWith('/course/')) return 'course'
  const t = pathname.slice(1) as HomeTab
  return t in PATH ? t : null
}

export default function TabLayout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { saved } = useCourses()
  return (
    <div className="pl-app">
      <Outlet />
      <BottomTabs active={tabOf(pathname)} savedCount={saved.length} onSelect={(t) => navigate(PATH[t])} />
    </div>
  )
}
