// 앱을 처음 열었을 때 잠깐 뜨는 로고 화면 — 세션당 한 번만 (PlannerApp이 관리)
import { useEffect } from 'react'

const HOLD_MS = 1200

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, HOLD_MS)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    // 로고 파일이 아직 없어 AuthScreen과 같은 텍스트 배지를 크게 쓴다.
    // 실제 로고(SVG/PNG)가 나오면 이 배지 자리만 <img>로 갈아끼우면 된다.
    <div className="pl-splash" onClick={onDone} role="img" aria-label="NOLDA 놀다">
      <div className="pl-splash-mark">
        <div className="pl-badge pl-badge-lg">
          <div className="pl-badge-t">NOLDA</div>
          <div className="pl-badge-s">놀다</div>
        </div>
        <div className="pl-splash-copy">세상에 놀거리는 다양하니까</div>
      </div>
    </div>
  )
}
