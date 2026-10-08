// /course/:id — 목록 위에 뜨는 코스 상세. 공유 링크로 바로 들어오면 서버에서 코스를 받아온다
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import CourseModal, { MODAL_CLOSE_MS } from '../components/CourseModal'
import ShareSheet from '../planner/ShareSheet'
import { fetchCourse } from '../planner/api'
import type { BuiltCourse } from '../planner/logic'
import { useBuilt } from '../state/analysis'
import { useCourses } from '../state/courses'
import { useToast } from '../state/toast'

export default function CourseModalRoute() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { getBuilt } = useBuilt()
  const c = useCourses()
  const toast = useToast()
  const course = getBuilt(id)
  const [closing, setClosing] = useState(false)
  const [shareOf, setShareOf] = useState<BuiltCourse | null>(null)

  const found = !!course
  useEffect(() => {
    if (found) return
    let alive = true
    fetchCourse(id)
      .then((x) => { if (alive) c.addCourses([x]) })
      .catch((e: Error) => {
        if (!alive) return
        toast(`코스를 열지 못했어요 · ${e.message}`)
        navigate('/courses', { replace: true })
      })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- id가 바뀌거나 아직 없을 때만
  }, [id, found])

  // 목록에서 열었으면 뒤로, 링크로 바로 왔으면 코스 목록으로
  const fromList = !!(location.state as { background?: unknown } | null)?.background
  const close = () => {
    if (closing) return
    const leave = () => (fromList ? navigate(-1) : navigate('/courses', { replace: true }))
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return leave()
    setClosing(true) // 내려가는 모션이 끝난 뒤 이동
    window.setTimeout(leave, MODAL_CLOSE_MS)
  }

  if (!course) return <div className="pl-modal-wrap"><div className="pl-sheet-backdrop" /></div>
  return (
    <>
      <CourseModal
        course={course}
        isSaved={c.saved.includes(course.id)}
        booked={c.booked}
        toggleBook={c.toggleBook}
        toggleSave={() => c.toggleSave(course.id)}
        start={() => navigate(`/course/${course.id}/live`)}
        share={() => setShareOf(course)}
        close={close}
        closing={closing}
      />
      {shareOf && (
        <ShareSheet
          course={shareOf}
          url={c.pool[shareOf.id]?.shareable ? `${window.location.origin}/course/${shareOf.id}` : ''}
          onClose={() => setShareOf(null)}
          toast={toast}
        />
      )}
    </>
  )
}
