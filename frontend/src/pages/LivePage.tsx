// /course/:id/live — 코스 진행(전체 화면 지도). 닫으면 코스 상세로
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import LiveCourse from '../planner/LiveCourse'
import { useBuilt } from '../state/analysis'
import { useCourses } from '../state/courses'

export default function LivePage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const course = useBuilt().getBuilt(id)
  const c = useCourses()
  // 코스를 아직 모르면(새로고침·직접 접속) 상세 화면이 서버에서 받아온다
  if (!course) return <Navigate to={`/course/${id}`} replace />
  // 상세에서 들어왔으면 뒤로, 바로 들어왔으면 상세로
  const close = () => (location.key !== 'default' ? navigate(-1) : navigate(`/course/${id}`, { replace: true }))
  return <LiveCourse course={course} isSaved={c.saved.includes(id)} toggleSave={() => c.toggleSave(id)} onClose={close} />
}
