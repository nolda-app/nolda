// 앱 첫 화면 — 하단 탭(홈/코스/검색/저장/마이페이지)으로 나뉜 껍데기
import { useEffect, useMemo, useRef, useState } from 'react'
import KindThumb from './KindThumb'
import { allPlaces, loadPlaces, placeInfo } from './geo'
import type { Place } from './geo'
import { COURSES, durLabel, won } from './data'
import type { Course } from './data'
import { CategoryView, MyView, PlaceSheet, SavedView, SearchView } from './HomeViews'
import BottomTabs from './BottomTabs'
import type { HomeTab } from './BottomTabs'

const HERO_MS = 5000
const REC_MS = 6000
const SOON = '아직 구현 중이에요. 조금만 기다려 주세요!'

const TAB_TITLE: Record<HomeTab, string> = {
  home: '', course: '', search: '검색', my: '마이페이지', saved: '저장',
}

/** 히어로 배경 — 실제 장소 사진 중 풍경이 담긴 것만 골랐다.
 *  (다른 공원 사진은 대부분 안내판·표지석이라 배경으로 못 쓴다)
 *  사진을 바꾸려면 pid만 갈아끼우면 된다. 못 불러오면 아래 그라데이션이 그대로 보인다. */
const HERO_PIDS = [
  'cbca2388-9610-5dbc-baef-612190116875', // 마포새빛문화숲 — 여의도 스카이라인과 노을
  '3bb1320b-ad28-5862-bb22-908a1883d1e8', // 망원한강공원 — 한강 노을
  '7dc72cd1-38eb-595c-90c0-5350bc0d7ce2', // 난지 한강공원 — 해 질 녘 산책길
]

/** '이런 데이트도 좋아요' — 눌러서 검색 탭의 해당 종류로 넘어간다 */
const MOODS: { l: string; kind: string; cls: string; d: string }[] = [
  { l: '분위기 좋은\n데이트', kind: '카페', cls: 'a', d: 'M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.6 12 20 12 20Z' },
  { l: '맛집\n데이트', kind: '식사', cls: 'b', d: 'M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-1.7 1.3-2.5 3.3-2.5 6v4H17v8' },
  { l: '산책\n데이트', kind: '산책', cls: 'c', d: 'M12 21v-6M12 15c-3.9 0-6-2.5-6-5.5C6 6 8.7 3 12 3s6 3 6 6.5c0 3-2.1 5.5-6 5.5ZM9 21h6' },
  { l: '체험\n데이트', kind: '체험', cls: 'd', d: 'M4 8h3l1.5-2h7L17 8h3v11H4ZM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z' },
]

/** 화면에 들어온 .pl-rv 요소만 한 번씩 올라오며 나타나게 한다.
 *  한 번 보이면 관찰을 끊어서, 위아래로 스크롤할 때마다 다시 튀지 않는다. */
function useReveal(root: React.RefObject<HTMLDivElement | null>, on: boolean) {
  useEffect(() => {
    const el = root.current
    if (!el || !on) return
    const targets = Array.from(el.querySelectorAll<HTMLElement>('.pl-rv'))
    // 지원 안 하는 브라우저에서는 그냥 처음부터 보이게 (애니메이션만 없는 것)
    if (!('IntersectionObserver' in window)) {
      targets.forEach((t) => t.classList.add('on'))
      return
    }
    const io = new IntersectionObserver((list) => {
      for (const e of list) {
        if (!e.isIntersecting) continue
        e.target.classList.add('on')
        io.unobserve(e.target)
      }
    }, { root: el, rootMargin: '0px 0px -6% 0px', threshold: 0.06 })
    targets.forEach((t) => io.observe(t))
    return () => io.disconnect()
  }, [root, on])
}

/** 사진이 있는 장소를 종류가 한쪽으로 몰리지 않게 번갈아 뽑는다 */
function pickPlaces(places: Place[], n: number): Place[] {
  const byKind = new Map<string, Place[]>()
  for (const p of places) {
    if (!p.img) continue
    const list = byKind.get(p.kind || '기타') || []
    list.push(p)
    byKind.set(p.kind || '기타', list)
  }
  for (const list of byKind.values()) list.sort(() => Math.random() - 0.5)

  const kinds = [...byKind.keys()].sort(() => Math.random() - 0.5)
  const out: Place[] = []
  for (let round = 0; out.length < n; round++) {
    const before = out.length
    for (const k of kinds) {
      const list = byKind.get(k)!
      if (round < list.length && out.length < n) out.push(list[round])
    }
    if (out.length === before) break // 더 뽑을 게 없음
  }
  return out
}

/** 코스 한 줄 요약 — 머무는 시간과 1인 비용을 더한 값 (이동 시간은 아직 안 넣는다) */
function courseSummary(c: Course) {
  const mins = c.items.reduce((s, it) => s + it.d, 0)
  const cost = c.items.reduce((s, it) => s + it.c, 0)
  return { mins, cost, first: c.items[0]?.pid }
}

/** 히어로 — 화면 맨 위에 붙박이로 있고 스크롤하지 않는다.
 *  문구와 '데이트 만들기' 버튼은 늘 보이고, 아래 내용만 그 밑에서 움직인다.
 *  배경 사진은 제자리에서 천천히 바뀌고, 보이는 동안 아주 조금씩 확대된다. */
function Hero({ ready, onStart }: { ready: boolean; onStart: () => void }) {
  const [i, setI] = useState(0)

  useEffect(() => {
    if (!ready) return
    const t = setInterval(() => setI((n) => (n + 1) % HERO_PIDS.length), HERO_MS)
    return () => clearInterval(t)
  }, [ready])

  return (
    <div className="pl-hero">
      <div className="pl-hero-bgs" aria-hidden>
        {ready && HERO_PIDS.map((pid, n) => {
          const img = placeInfo(pid)?.img
          return img ? <img key={pid} className={'pl-hero-bg' + (n === i ? ' on' : '')} src={img} alt="" /> : null
        })}
      </div>
      <div className="pl-hero-shade" aria-hidden />
      <div className="pl-hero-body">
        <div className="pl-hero-t">오늘 뭐 할까?</div>
        <div className="pl-hero-s">당신의 취향과 일상을 분석해<br />AI가 딱 맞는 데이트 코스를 추천해드려요</div>
      </div>
      <svg className="pl-hero-heart" viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="#fff" strokeWidth={1.3} aria-hidden>
        <path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.6 12 20 12 20Z" />
      </svg>
      <button type="button" className="pl-hero-cta" onClick={onStart}>
        <span aria-hidden>✨</span> 오늘의 데이트 만들기 <span className="pl-hero-cta-x" aria-hidden>›</span>
      </button>
    </div>
  )
}

/** 오늘의 추천 코스 — 아직 취향 분석 전이라 미리 만들어 둔 코스를 돌려 보여준다 */
function RecCourses({ ready, onOpen, onAll }: { ready: boolean; onOpen: (id: string) => void; onAll: () => void }) {
  const list = useMemo(() => COURSES.slice(0, 3), [])
  const [i, setI] = useState(0)
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (held) return
    const t = setInterval(() => setI((n) => (n + 1) % list.length), REC_MS)
    return () => clearInterval(t)
  }, [held, list.length])

  const c = list[i]
  const { mins, cost, first } = courseSummary(c)

  return (
    <section className="pl-rec pl-rv" onPointerDown={() => setHeld(true)}>
      <div className="pl-rec-head">
        <h2>오늘의 추천 코스</h2>
        <button type="button" onClick={onAll}>전체보기</button>
      </div>

      <div className="pl-rec-card" onClick={() => onOpen(c.id)} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') onOpen(c.id) }}>
        <div className="pl-rec-img">
          {ready ? <KindThumb kind={c.items[0]?.k || ''} size={104} pid={first} /> : <div className="pl-rec-imgskel" />}
        </div>
        <div className="pl-rec-body">
          <span className="pl-rec-badge">취향 맞춤</span>
          <div className="pl-rec-t">{c.title}</div>
          <div className="pl-rec-flow">
            {c.items.map((it, n) => (
              <span key={n} className="pl-rec-stop">
                <KindThumb kind={it.k} size={17} />
                {it.k}
              </span>
            ))}
          </div>
          <div className="pl-rec-meta">예상 소요시간 {durLabel(mins)} · 예상 비용 {won(cost)}</div>
          <div className="pl-rec-go">코스 보기 <span aria-hidden>›</span></div>
        </div>
      </div>

      <div className="pl-rec-dots">
        {list.map((x, n) => (
          <button key={x.id} type="button" className={n === i ? 'on' : ''}
            onClick={() => { setHeld(true); setI(n) }} aria-label={`${n + 1}번째 추천 코스`} />
        ))}
      </div>
    </section>
  )
}

export default function HomeScreen({ authed, userName, avatar, savedCourses, tab, setTab, onStart, onLogin, onRename, onLogout, onOpenSaved, onOpenCourse }: {
  authed: boolean
  userName: string
  avatar: string | null
  savedCourses: Course[]
  tab: HomeTab
  setTab: (t: HomeTab) => void
  /** 코스 만들기 — 취향 분석부터 다시 */
  onStart: () => void
  /** 로그인만 하러 감 — 끝나면 홈으로 돌아온다 */
  onLogin: () => void
  /** 마이페이지에서 이름 저장 — 실패하면 문구를 돌려준다 */
  onRename: (name: string, avatar?: string) => Promise<string | null>
  /** 로그아웃 — 토큰·유튜브 연동을 끊는다 */
  onLogout: () => void
  /** 앱 안쪽 '저장한 코스' 화면으로 */
  onOpenSaved: () => void
  /** 추천 코스 하나를 분석 없이 바로 열기 */
  onOpenCourse: (id: string) => void
}) {
  const [places, setPlaces] = useState<Place[]>([])
  const [failed, setFailed] = useState(false)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<string | null>(null)
  const [picked, setPicked] = useState<Place | null>(null)
  const [toast, setToast] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    loadPlaces()
      .then(() => { if (alive) setPlaces(allPlaces()) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  // 아직 화면이 없는 메뉴는 문구만 띄운다
  const soon = () => {
    setToast(SOON)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2200)
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  // 탭을 옮기면 맨 위부터 보이게 (앱에서 흔한 동작)
  const go = (t: HomeTab) => {
    setTab(t)
    scrollRef.current?.scrollTo({ top: 0 })
    if (t === 'search') setTimeout(() => searchRef.current?.focus(), 0)
  }

  // 흘러가는 줄은 한 번 고른 뒤 바뀌지 않게 — 계속 다시 섞이면 어지럽다
  const marquee = useMemo(() => pickPlaces(places, 14), [places])
  const ready = !!places.length
  const home = tab === 'home'
  // 장소를 받아오면 홈 내용이 늘어나므로 그때 다시 관찰한다
  useReveal(scrollRef, home && ready)

  // 내용이 배너를 덮을 만큼 올라오면 상단바에 배경을 깐다 (안 그러면 흰 로고가 안 보인다)
  const [solid, setSolid] = useState(false)
  useEffect(() => {
    const sc = scrollRef.current
    if (!sc || !home) { setSolid(false); return }
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; setSolid(sc.scrollTop > 150) })
    }
    onScroll()
    sc.addEventListener('scroll', onScroll, { passive: true })
    return () => { sc.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [home])


  return (
    <div className="pl-screen pl-screen-fixed">
      {/* 홈은 사진 위에 로고·알림을 겹쳐 두고, 내려가면 배경이 깔리며 상단에 붙는다 */}
      {home ? (
        <div className={'pl-topbar' + (solid ? ' solid' : '')}>
          <div className="pl-topbar-logo">NOLDA</div>
          {!authed && <button type="button" className="pl-topbar-login" onClick={onLogin}>로그인</button>}
          <button type="button" className="pl-topbar-bell" onClick={soon} aria-label="알림">
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6ZM13.7 20a2 2 0 0 1-3.4 0" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="pl-vtitle">{TAB_TITLE[tab]}</div>
      )}

      {tab === 'search' && (
        <div className="pl-home-search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="어디서 놀까요? 장소·동네 검색"
            aria-label="장소 검색"
          />
          {!!q && <button type="button" className="pl-home-clear" onClick={() => setQ('')} aria-label="검색어 지우기">✕</button>}
        </div>
      )}

      <div className="pl-scroll" ref={scrollRef} style={{ padding: '0 0 104px' }}>
        {failed && <div className="pl-home-empty">장소를 불러오지 못했어요. 잠시 뒤 다시 열어주세요.</div>}

        {home && (
          <>
            {/* 배너는 제자리에 붙어 있고(sticky), 아래 장이 그 위를 덮으며 올라간다 */}
            <Hero ready={ready} onStart={onStart} />

            <div className="pl-homesheet">
            <RecCourses ready={ready} onOpen={onOpenCourse} onAll={() => setTab('course')} />

            <div className="pl-home-pad">
              <h2 className="pl-sec-t pl-rv">이런 데이트도 좋아요</h2>
              <div className="pl-moods pl-rv">
                {MOODS.map((m) => (
                  <button key={m.l} type="button" className={'pl-mood pl-mood-' + m.cls}
                    onClick={() => { setKind(m.kind); go('search') }}>
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
            </div>

            <div className="pl-home-pad">
              <button type="button" className="pl-home-cta" onClick={onStart}>
                {authed && userName ? `${userName}님 취향으로 코스 만들기` : '내 취향으로 코스 만들기'}
              </button>
            </div>
            </div>
          </>
        )}

        {tab === 'search' && (kind
          ? <CategoryView places={places} kind={kind} setKind={setKind} onPick={setPicked} />
          : <SearchView places={places} q={q} setQ={setQ} onPick={setPicked} />)}
        {tab === 'saved' && <SavedView courses={savedCourses} onOpen={onOpenSaved} onStart={onStart} />}
        {tab === 'my' && (
          <MyView
            authed={authed} userName={userName} avatar={avatar} savedCount={savedCourses.length}
            onLogin={onLogin} onSaved={() => go('saved')} onStart={onStart} onRename={onRename} onLogout={onLogout} soon={soon}
          />
        )}
      </div>

      <BottomTabs active={tab} savedCount={savedCourses.length} onSelect={go} />

      {picked && <PlaceSheet p={picked} onClose={() => setPicked(null)} />}
      {toast && <div className="pl-toast" role="status">{toast}</div>}
    </div>
  )
}
