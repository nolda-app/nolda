// / — 고정 배너 + 덮으며 올라오는 판(추천 코스·이런 데이트·지금 가볼 만한 곳)
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import KindThumb from '../planner/KindThumb'
import type { Place } from '../planner/geo'
import { PlaceSheet } from '../planner/HomeViews'
import { Hero, MOODS, RecCourses, pickPlaces, useReveal } from '../components/HomeParts'
import { useAuth } from '../state/auth'
import { useAnalysis } from '../state/analysis'
import { useToast } from '../state/toast'
import { usePlaces } from './usePlaces'

export const SOON = '아직 구현 중이에요. 조금만 기다려 주세요!'

export default function HomePage() {
  const { token, user } = useAuth()
  const authed = !!token || !!user
  const userName = user?.name || ''
  const a = useAnalysis()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const { places, failed, waking, ready } = usePlaces({ retry: true })
  const [picked, setPicked] = useState<Place | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const marquee = useMemo(() => pickPlaces(places, 14), [places]) // 한 번 고른 뒤 안 바뀌게
  // 정적인 내용(추천 코스·분위기 타일)은 서버 응답과 상관없이 바로 나타나야 한다
  useReveal(scrollRef, true)

  // 내용이 배너를 덮을 만큼 올라오면 상단바에 배경을 깐다 (안 그러면 흰 로고가 안 보인다)
  const [solid, setSolid] = useState(false)
  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; setSolid(sc.scrollTop > 150) })
    }
    onScroll()
    sc.addEventListener('scroll', onScroll, { passive: true })
    return () => { sc.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])

  // 홈에서 코스를 만들면 늘 취향 분석부터 (로그인 안 했으면 RequireAuth가 로그인으로 보낸다)
  const onStart = () => { a.restart(); navigate('/start') }
  const soon = () => toast(SOON)

  return (
    <div className="pl-screen pl-screen-fixed">
      {/* 홈은 사진 위에 로고·알림을 겹쳐 두고, 내려가면 배경이 깔리며 상단에 붙는다 */}
      <div className={'pl-topbar' + (solid ? ' solid' : '')}>
        <div className="pl-topbar-logo">NOLDA</div>
        {!authed && <button type="button" className="pl-topbar-login" onClick={() => navigate('/login?next=%2F')}>로그인</button>}
        <button type="button" className="pl-topbar-bell" onClick={soon} aria-label="알림">
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6ZM13.7 20a2 2 0 0 1-3.4 0" />
          </svg>
        </button>
      </div>

      <div className="pl-scroll" ref={scrollRef} style={{ padding: '0 0 104px' }}>
        {failed && (
          <div className="pl-home-empty">
            장소를 불러오지 못했어요.
            <br /><button type="button" className="pl-home-retry" onClick={() => window.location.reload()}>다시 시도</button>
          </div>
        )}

        {/* 배너는 제자리에 붙어 있고(sticky), 아래 장이 그 위를 덮으며 올라간다 */}
        <Hero ready={ready} onStart={onStart} />

        <div className="pl-homesheet">
        {waking && !ready && !failed && (
          <div className="pl-wake" role="status">
            <span className="pl-wake-dot" aria-hidden />
            서버를 깨우는 중이에요. 최대 1분쯤 걸려요
          </div>
        )}
        <RecCourses ready={ready} onOpen={(id) => navigate('/course/' + id, { state: { background: location } })} onAll={() => navigate('/courses')} />

        <div className="pl-home-pad">
          <h2 className="pl-sec-t pl-rv">이런 데이트도 좋아요</h2>
          <div className="pl-moods pl-rv">
            {MOODS.map((m) => (
              <button key={m.l} type="button" className={'pl-mood pl-mood-' + m.cls}
                onClick={() => navigate('/search?kind=' + encodeURIComponent(m.kind))}>
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={m.d} />
                </svg>
                <span>{m.l}</span>
              </button>
            ))}
          </div>

          <button type="button" className="pl-promo pl-rv" onClick={soon}>
            <span className="pl-promo-face" aria-hidden>🐱</span>
            <span className="pl-promo-copy">
              <b>NOLDA가 기억하는</b>
              {authed && userName ? `${userName}님의 취향을 바탕으로` : '당신의 취향을 바탕으로'}
              <br />오늘도 특별한 데이트를 추천해드려요!
            </span>
            <span className="pl-promo-x" aria-hidden>›</span>
          </button>

          <h2 className="pl-sec-t pl-rv">지금 가볼 만한 곳</h2>
        </div>

        {/* 같은 목록을 두 번 이어 붙이고 절반만큼 밀어서 끊김 없이 흐르게 한다 */}
        <div className="pl-marquee pl-rv">
          {!ready ? (
            <div className="pl-marquee-track pl-marquee-skel" aria-hidden>
              {Array.from({ length: 5 }, (_, i) => (
                <span className="pl-pcard" key={i}>
                  <span className="pl-pcard-img pl-skel" />
                  <span className="pl-pcard-name pl-skel pl-skel-line" />
                </span>
              ))}
            </div>
          ) : (
          <div className="pl-marquee-track">
            {[...marquee, ...marquee].map((p, i) => (
              <button
                type="button" className="pl-pcard" key={`${p.id}-${i}`}
                aria-hidden={i >= marquee.length} tabIndex={i >= marquee.length ? -1 : 0}
                onClick={() => setPicked(p)}
              >
                <span className="pl-pcard-img"><KindThumb kind={p.kind || ''} size={160} pid={p.id} /></span>
                <span className="pl-pcard-name">{p.name}</span>
                <span className="pl-pcard-sub">{[p.kind, p.area].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
          </div>
          )}
        </div>

        <div className="pl-home-pad">
          <button type="button" className="pl-home-cta" onClick={onStart}>
            {authed && userName ? `${userName}님 취향으로 코스 만들기` : '내 취향으로 코스 만들기'}
          </button>
        </div>
        </div>
      </div>

      {picked && <PlaceSheet p={picked} onClose={() => setPicked(null)} />}
    </div>
  )
}
