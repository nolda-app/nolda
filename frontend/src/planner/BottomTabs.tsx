// 앱 하단 탭바 — 홈과 코스 화면이 같은 막대를 쓴다 (한쪽만 바꾸면 화면마다 달라 보임)
import { useLayoutEffect, useRef, useState } from 'react'

export type HomeTab = 'home' | 'course' | 'search' | 'my' | 'saved'

/** 활성 표시 막대의 고정 너비(px). 위치만 움직이므로 너비는 애니메이션하지 않는다 */
const BEAD_W = 26

export const TABS: { key: HomeTab; l: string; d: string }[] = [
  { key: 'home', l: '홈', d: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5M9.5 20v-6h5v6' },
  // 코스 — 지도 위 경로처럼 점을 선으로 이은 모양
  { key: 'course', l: '코스', d: 'M6 5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM18 14.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM8.5 7.5h5a3 3 0 0 1 0 6h-3a3 3 0 0 0 0 6h5' },
  { key: 'search', l: '검색', d: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-3.5-3.5' },
  { key: 'saved', l: '저장', d: 'M6.5 3.5h11v17l-5.5-4-5.5 4v-17Z' },
  { key: 'my', l: '마이페이지', d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0' },
]

export default function BottomTabs({ active, savedCount, onSelect }: {
  /** 지금 켜진 탭. 코스 목록처럼 탭에 없는 화면이면 null */
  active: HomeTab | null
  savedCount?: number
  onSelect: (t: HomeTab) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRefs = useRef<Partial<Record<HomeTab, HTMLButtonElement | null>>>({})
  // x는 막대의 왼쪽 좌표. settled 전에는 전환 없이 자리만 잡아 첫 렌더에 미끄러지지 않게 한다
  const [bead, setBead] = useState<{ x: number; settled: boolean }>({ x: 0, settled: false })

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const place = () => {
      const btn = active ? btnRefs.current[active] : null
      if (!btn) return
      const x = btn.offsetLeft + btn.offsetWidth / 2 - BEAD_W / 2
      // 값이 같으면 settled만 켜서 불필요한 렌더를 막는다
      setBead((p) => (p.x === x && p.settled ? p : { x, settled: true }))
    }

    place()
    const ro = new ResizeObserver(place)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [active])

  return (
    <div className="pl-hometab" ref={wrapRef}>
      <i
        className={'pl-hometab-bead' + (bead.settled && active ? '' : ' idle')}
        style={{ width: BEAD_W, transform: `translateX(${bead.x}px)` }}
        aria-hidden
      />
      {TABS.map((t) => (
        <button
          key={t.key} type="button" className={'pl-hometab-btn' + (active === t.key ? ' on' : '')}
          ref={(el) => { btnRefs.current[t.key] = el }}
          onClick={() => onSelect(t.key)} aria-current={active === t.key || undefined}
        >
          <span className="pl-hometab-ico">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={t.d} />
            </svg>
            {t.key === 'saved' && !!savedCount && <i className="pl-hometab-dot" aria-hidden />}
          </span>
          <span>{t.l}</span>
        </button>
      ))}
    </div>
  )
}
