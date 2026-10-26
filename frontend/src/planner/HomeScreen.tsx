// 앱 첫 화면 — 하단 탭(홈/코스/검색/저장/마이페이지)으로 나뉜 껍데기
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import KindThumb from './KindThumb'
import { allPlaces, loadPlaces, placeGeo, placeInfo } from './geo'
import NaverMap from './NaverMap'
import type { MapMarker } from './NaverMap'
import { useWalkLegs } from './useWalkLegs'
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

/** 서울 풍경 + 야경 — Wikimedia Commons, CC0·퍼블릭 도메인(저작자 표기 불필요). frontend/public/hero/ 에 있다
 *  day: Han River Seoul skyline (Pixabay) · dusk: Purple sky of Seoul and Lotte World Tower
 *  fountain: Jamsu Bridge Rainbow Fountain · night: Banpo Bridge Moonlight Rainbow Fountain at night (2023) */
const HERO_LOCAL = ['/hero/day.jpg', '/hero/dusk.jpg', '/hero/fountain.jpg', '/hero/night.jpg']

/** 카테고리 바로가기 — 눌러서 검색 탭의 해당 종류로 넘어간다 */
/** 카테고리 아이콘 — 한 덩어리가 아니라 조각(층)별로 겹쳐 두고, 일부 조각만 움직인다.
 *  src는 public/icons/, cls는 planner.css의 .mi-* 모션, o는 회전·확대의 중심(%), d는 시작 지연 */
interface MoodLayer { f: string; cls?: string; o?: string; d?: string }
const MOODS: { l: string; kind: string; cls: string; wrap?: string; layers: MoodLayer[] }[] = [
  { l: '분위기 좋은\n데이트', kind: '카페', cls: 'a', layers: [
    { f: 'cafe-base' },
    { f: 'cafe-heart', cls: 'mi-heart', o: '40% 24%' },
    { f: 'cafe-spark', cls: 'mi-spark', o: '76% 26%', d: '.4s' },
  ] },
  { l: '맛집\n데이트', kind: '식사', cls: 'b', layers: [
    { f: 'meal-base' },
    { f: 'meal-chop', cls: 'mi-chop', o: '55% 32%', d: '.3s' },
  ] },
  { l: '산책\n데이트', kind: '산책', cls: 'c', layers: [
    { f: 'walk-base' },
    { f: 'walk-crown', cls: 'mi-crown', o: '49% 61%', d: '.6s' },
    { f: 'walk-dotl', cls: 'mi-float', o: '24% 69%', d: '.2s' },
    { f: 'walk-dotr', cls: 'mi-float', o: '79% 73%', d: '1.1s' },
  ] },
  { l: '체험\n데이트', kind: '체험', cls: 'd', wrap: 'mi-spin', layers: [
    { f: 'exp-base' },
    { f: 'exp-p0', cls: 'mi-dot', o: '43% 33%', d: '0s' },
    { f: 'exp-p1', cls: 'mi-dot', o: '63% 35%', d: '.5s' },
    { f: 'exp-p2', cls: 'mi-dot', o: '31% 50%', d: '1s' },
    { f: 'exp-p3', cls: 'mi-dot', o: '35% 67%', d: '1.5s' },
  ] },
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
 *  배경 사진은 옆으로 미끄러지며 다음 장으로 넘어간다. */
function Hero() {
  const [i, setI] = useState(0)
  const imgs = HERO_LOCAL

  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % imgs.length), HERO_MS)
    return () => clearInterval(t)
  }, [imgs.length])

  return (
    <div className="pl-hero">
      <div className="pl-hero-bgs" aria-hidden>
        {imgs.map((src, n) => {
          // 현재 장 0, 다음 장 1, 직전 장 -1. 그 밖은 화면 밖에서 대기(이동 애니메이션 없이 자리만 옮김)
          let off = (n - i + imgs.length) % imgs.length
          if (off === imgs.length - 1) off = -1
          const far = off > 1
          return (
            <img
              key={src}
              className={'pl-hero-bg' + (far ? ' far' : '')}
              style={{ transform: `translateX(${off * 100}%)` }}
              src={src}
              alt=""
            />
          )
        })}
      </div>
      <div className="pl-hero-shade" aria-hidden />
      <div className="pl-hero-body">
        <div className="pl-hero-t">오늘 뭐 할까?</div>
        <div className="pl-hero-s">내 취향을 바탕으로<br />오늘의 놀거리 코스를 만들어보세요.</div>
      </div>
    </div>
  )
}

/** 오늘의 코스 띠 — 히어로 바로 아래. 상자 없이 한 줄로, 누르면 코스 만들기로 간다 */
function TodayBar({ onStart }: { onStart: () => void }) {
  return (
    <div className="pl-today">
      <span className="pl-today-ic" aria-hidden>🐱</span>
      <span className="pl-today-copy">
        <b>NOLDA의 추천 코스 <i>취향 맞춤</i></b>
        YouTube와 사진첩에서 발견한 당신의 취향으로<br />오늘의 놀거리 코스를 만들어드려요.
      </span>
      <button type="button" className="pl-today-btn" onClick={onStart} aria-label="오늘의 코스 만들기">
        시작하기 <span aria-hidden>›</span>
      </button>
    </div>
  )
}

/** 추천 코스 한 장 — 지도 + 사진 세 장 + 제목·버튼이 한 덩어리 */
function RecCard({ c, ready, onOpen }: { c: Course; ready: boolean; onOpen: (id: string) => void }) {
  const { mins, cost } = courseSummary(c)

  // 지도에 사진 핀을 꽂을 좌표 — 장소 목록을 받은 뒤에만 만들 수 있다
  const markers = useMemo<MapMarker[]>(() => {
    if (!ready) return []
    const out: MapMarker[] = []
    c.items.forEach((it, n) => {
      const g = placeGeo(it.pid)
      if (g) out.push({ no: n + 1, name: it.n, time: '', lat: g[0], lng: g[1], img: placeInfo(it.pid)?.img })
    })
    return out
  }, [c, ready])
  const paths = useWalkLegs(c.id, markers, ready && markers.length === c.items.length)

  return (
    <>
      <div className="pl-rec-mapwrap">
        <NaverMap markers={markers} color="#00845A" paths={paths} className="pl-rec-map" soft
          fitPadding={{ top: 60, right: 44, bottom: 50, left: 44 }} />
        <span className="pl-rec-fade" aria-hidden />
        <span className="pl-rec-chip">{c.items.length}곳 · {durLabel(mins)} · 도보 이동</span>
      </div>

      <div className="pl-rec-steps">
        {c.items.map((it, n) => (
          <span key={n} className="pl-rec-step">
            {n > 0 && <span className="pl-rec-arrow" aria-hidden>›</span>}
            <span className="pl-rec-photo">
              <KindThumb kind={it.k} size={100} pid={it.pid} />
              <span className="pl-rec-kind">{it.k}</span>
            </span>
          </span>
        ))}
      </div>

      <div className="pl-rec-foot">
        <div>
          <div className="pl-rec-t">{c.title}</div>
          <div className="pl-rec-meta">예상 소요시간 {durLabel(mins)} · 예상 비용 {won(cost)}</div>
        </div>
        <button type="button" className="pl-rec-go" onClick={() => onOpen(c.id)}>코스 보기 <span aria-hidden>›</span></button>
      </div>
    </>
  )
}

/** 오늘의 추천 코스 — 카드가 책장처럼 오른쪽으로 겹겹이 쌓여 있다.
 *  왼쪽으로 밀면 맨 앞 카드가 흰색으로 덮이며 젤리처럼 눌려 왼쪽으로 사라지고, 뒤 카드가 한 칸씩 앞으로 올라온다.
 *  반대로 오른쪽으로 밀면 직전 코스가 눌린 모양에서 다시 펴지며 맨 앞으로 돌아온다. 아직 취향 분석 전이라 미리 만들어 둔 코스를 돌려 보여준다 */
// 스프링 — 값이 작을수록 출렁임이 커진다 (감쇠비 약 0.6 → 한 번 살짝 넘쳤다 돌아옴)
const SPRING_K = 230
const SPRING_C = 18

function RecCourses({ ready, onOpen, onAll }: { ready: boolean; onOpen: (id: string) => void; onAll: () => void }) {
  const list = useMemo(() => COURSES.slice(0, 3), [])
  const L = list.length
  const [i, setI] = useState(0)
  const [held, setHeld] = useState(false)
  const deck = useRef<HTMLDivElement>(null)
  const cards = useRef<(HTMLDivElement | null)[]>([])
  const start = useRef<{ x: number; y: number; id: number } | null>(null)
  const drag = useRef<{ up: number; low: number; t: number; v: number; at: number } | null>(null)
  const dragged = useRef(false)
  const busy = useRef(false)

  // 위 카드(up)는 t만큼 젤리처럼 눌려 사라지고, 아래 카드(low)는 t만큼 밑에서 올라온다. 나머지는 숨긴다
  // 렌더할 때마다 지도가 다시 그려지지 않도록 화면은 직접 고친다
  const paint = useCallback((up: number, _low: number, t: number, v: number) => {
    const c = Math.min(Math.max(t, 0), 1)
    cards.current.forEach((el, n) => {
      if (!el) return
      const veil = el.querySelector<HTMLElement>('.pl-deckveil')
      // up 카드 기준 몇 번째로 쌓여 있는지 (0 = 맨 앞)
      const off = (n - up + L) % L
      el.style.zIndex = String(L - off)
      if (off === 0) {
        // 맨 앞 카드 — 왼쪽 가장자리를 붙잡고 눌리며, 가운데가 위아래로 불룩. 다 눌리면 작아지며 사라진다
        const sx = Math.max(1 - t, 0)
        const sy = (1 + 0.1 * Math.sin(Math.PI * c)) * (1 - 0.3 * c * c * c)
        el.style.transformOrigin = '0 50%'
        el.style.transform = `scale(${sx}, ${sy})`
        el.style.opacity = String(Math.min(sx * 5, 1))
        // 눌리는 동안 오른쪽부터 흰색이 차올라 지도·사진이 지저분하게 찌그러진 모습을 덮는다
        if (veil) {
          veil.style.opacity = String(Math.min(c * 2.2, 1))
          veil.style.background = `linear-gradient(270deg, #fff ${Math.round(c * 160)}%, rgba(255, 255, 255, ${(c * 0.8).toFixed(2)}) 100%)`
        }
      } else {
        // 뒤에 쌓인 카드 — 책장처럼 오른쪽으로 조금씩 삐져나와 있다가 t만큼 한 칸씩 앞으로 올라온다
        // 꼭대기를 지나치면 납작하게 눌렸다 돌아온다 — 물방울처럼
        const e = off - t
        const sp = off === 1 ? Math.min(Math.abs(v), 3) / 3 : 0
        const over = off === 1 ? Math.max(t - 1, 0) : 0
        const sc = 1 - Math.max(e, 0) * 0.05
        const ly = sc * (1 + sp * 0.03 - over * 0.7)
        const lx = sc * (1 - sp * 0.02 + over * 0.45)
        el.style.transformOrigin = '100% 50%'
        el.style.transform = `translateX(${Math.max(e, 0) * 11}px) scale(${lx}, ${ly})`
        el.style.opacity = '1'
        if (veil) veil.style.opacity = '0'
      }
    })
  }, [L])

  // 지금 코스가 바뀌면 제자리 — 지금 카드는 그대로, 다음 카드는 밑에 대기
  useLayoutEffect(() => { paint(i, (i + 1) % L, 0, 0) }, [i, L, paint])

  // 손을 떼면 스프링으로 끝까지(또는 제자리로) 튕기듯 간다
  const spring = useCallback((up: number, low: number, from: number, v0: number, to: number, done: () => void) => {
    busy.current = true
    let x = from
    let v = v0
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30)
      last = now
      v += (-SPRING_K * (x - to) - SPRING_C * v) * dt
      x += v * dt
      // 위 카드는 다 눌린 뒤엔 되살아나지 않게 — 아래 카드만 꼭대기에서 출렁인다
      paint(up, low, x, v)
      if (Math.abs(x - to) < 0.002 && Math.abs(v) < 0.02) {
        paint(up, low, to, 0)
        busy.current = false
        done()
        return
      }
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [paint])

  const next = useCallback(() => {
    if (busy.current) return
    const low = (i + 1) % L
    spring(i, low, 0, 0, 1, () => setI(low))
  }, [i, L, spring])

  useEffect(() => {
    if (held) return
    const t = setInterval(next, REC_MS)
    return () => clearInterval(t)
  }, [held, next])

  function down(e: React.PointerEvent) {
    setHeld(true)
    if (busy.current) return
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    dragged.current = false
    drag.current = null
  }

  function move(e: React.PointerEvent) {
    const s = start.current
    if (!s) return
    const mx = e.clientX - s.x
    const my = e.clientY - s.y
    if (!dragged.current) {
      // 세로로 더 많이 움직이면 화면 스크롤에 맡긴다
      if (Math.abs(my) > Math.abs(mx) && Math.abs(my) > 8) { start.current = null; return }
      if (Math.abs(mx) < 8) return
      dragged.current = true
      e.currentTarget.setPointerCapture(s.id)
    }
    const w = deck.current?.clientWidth ?? 1
    // 왼쪽으로 밀면: 지금 → 다음. 오른쪽으로 밀면: 직전 카드가 다시 펴지고 지금 카드가 뒤로 밀려난다
    const up = mx < 0 ? i : (i + L - 1) % L
    const low = mx < 0 ? (i + 1) % L : i
    const t = mx < 0 ? Math.min(-mx / w, 1) : Math.max(1 - mx / w, 0)
    const now = performance.now()
    const d = drag.current
    const v = d && d.up === up ? (t - d.t) / Math.max((now - d.at) / 1000, 0.001) : 0
    drag.current = { up, low, t, v: d && d.up === up ? v * 0.6 + d.v * 0.4 : 0, at: now }
    paint(up, low, t, drag.current.v)
  }

  function up() {
    const s = start.current
    start.current = null
    const d = drag.current
    drag.current = null
    if (!s || !dragged.current || !d) return
    const forward = d.up === i
    // 많이 밀었거나 빠르게 튕기면 넘어가고, 아니면 제자리로 출렁 돌아온다
    const go = forward ? d.t > 0.28 || d.v > 1.6 : d.t < 0.72 || d.v < -1.6
    const to = forward ? (go ? 1 : 0) : (go ? 0 : 1)
    spring(d.up, d.low, d.t, d.v, to, () => {
      if (forward && go) setI(d.low)
      else if (!forward && go) setI(d.up)
      else paint(i, (i + 1) % L, 0, 0)
    })
  }

  return (
    <section className="pl-rec pl-rv">
      <div className="pl-rec-head">
        <h2>오늘의 추천 코스</h2>
        <button type="button" onClick={onAll}>전체보기 ›</button>
      </div>

      <div className="pl-deck" ref={deck} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onDragStart={(e) => e.preventDefault()}
        onClickCapture={(e) => { if (dragged.current) { e.stopPropagation(); dragged.current = false } }}>
        {list.map((c, n) => (
          <div key={c.id} className="pl-deckcard" ref={(el) => { cards.current[n] = el }}>
            <RecCard c={c} ready={ready} onOpen={onOpen} />
            <span className="pl-deckveil" aria-hidden />
          </div>
        ))}
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
            <Hero />

            <div className="pl-homesheet">
            <TodayBar onStart={onStart} />
            <RecCourses ready={ready} onOpen={onOpenCourse} onAll={() => setTab('course')} />

            <div className="pl-home-pad">
              <div className="pl-moodband pl-rv">
              <div className="pl-moods">
                {MOODS.map((m) => (
                  <button key={m.l} type="button" className={'pl-mood pl-mood-' + m.cls}
                    onClick={() => { setKind(m.kind); go('search') }}>
                    <span className={'pl-mood-e ' + (m.wrap ?? '')} aria-hidden>
                      {m.layers.map((ly) => (
                        <img key={ly.f} className={'mi ' + (ly.cls ?? '')} src={`/icons/mood-${ly.f}.png`} alt=""
                          style={{ transformOrigin: ly.o, animationDelay: ly.d }} />
                      ))}
                    </span>
                    <span>{m.l}</span>
                  </button>
                ))}
              </div>
              </div>

              <div className="pl-sec-row pl-rv">
                <h2 className="pl-sec-t">지금 가볼 만한 곳</h2>
                <button type="button" onClick={() => go('search')}>전체보기 ›</button>
              </div>
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
