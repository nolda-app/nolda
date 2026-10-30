// /my — 프로필·로그아웃. 로그아웃 버튼은 앱에서 여기 하나뿐이다
import { useNavigate } from 'react-router-dom'
import { MyView } from '../planner/HomeViews'
import { useAuth } from '../state/auth'
import { useAnalysis } from '../state/analysis'
import { useCourses } from '../state/courses'
import { useToast } from '../state/toast'
import { SOON } from './HomePage'

export default function MyPage() {
  const auth = useAuth()
  const a = useAnalysis()
  const { saved } = useCourses()
  const toast = useToast()
  const navigate = useNavigate()
  return (
    <div className="pl-screen pl-screen-fixed">
      <div className="pl-vtitle">마이페이지</div>
      <div className="pl-scroll" style={{ padding: '0 0 104px' }}>
        <MyView
          authed={!!auth.token} userName={auth.user?.name || ''} avatar={auth.user?.avatar || null} savedCount={saved.length}
          onLogin={() => navigate('/login?next=%2Fmy')}
          onSaved={() => navigate('/saved')}
          onStart={() => { a.restart(); navigate('/start') }}
          onRename={auth.updateProfile}
          onLogout={() => {
            // 분석 결과·유튜브 연동까지 끊고 홈으로
            a.restart(); a.setYtId(null); auth.logout()
            navigate('/', { replace: true })
          }}
          soon={() => toast(SOON)}
        />
      </div>
    </div>
  )
}
