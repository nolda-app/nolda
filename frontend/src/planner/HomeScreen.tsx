// 앱 첫 화면 — 하단 탭(홈/카테고리/검색/마이페이지/저장)으로 나뉜 껍데기
import { useEffect, useMemo, useRef, useState } from 'react'
import KindThumb from './KindThumb'
import { allPlaces, loadPlaces } from './geo'
import type { Place } from './geo'
import type { Course } from './data'
import { CategoryView, KINDS, MyView, PlaceSheet, SavedView, SearchView } from './HomeViews'
import BottomTabs from './BottomTabs'
import type { HomeTab } from './BottomTabs'

const MARQUEE_N = 14 // 흘러가는 줄에 올릴 장소 수
const BANNER_MS = 4500
const SOON = '아직 구현 중이에요. 조금만 기다려 주세요!'

const TAB_TITLE: Record<HomeTab, string> = {
  home: '', course: '', search: '검색', my: '마이페이지', saved: '저장',
}

// 배너는 아직 받아올 데이터가 없어 화면 확인용 더미다.
// 행사·광고 데이터가 생기면 이 배열을 API 응답으로 바꾸면 된다.
const BANNERS = [
  { t: '망원동 골목 산책 코스', s: '시장 구경하고 한강까지 걷기', bg: 'linear-gradient(135deg,#00A46E,#00845A)' },
  { t: '연남동 카페 투어', s: '경의선숲길 따라 이어지는 카페들', bg: 'linear-gradient(135deg,#8A5A2B,#C0622B)' },
  { t: '이번 주 마포 행사', s: '전시·공연·플리마켓 모아보기', bg: 'linear-gradient(135deg,#3D6E99,#5B4B8A)' },
]

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

function PlaceCard({ p, onPick }: { p: Place; onPick: () => void }) {
  return (
    <div className="pl-homecard" onClick={onPick} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onPick() }}>
      <div className="pl-homecard-img">
        <KindThumb kind={p.kind || ''} size={160} pid={p.id} />
      </div>
      <div className="pl-homecard-name">{p.name}</div>
      <div className="pl-homecard-sub">{[p.kind, p.area].filter(Boolean).join(' · ')}</div>
    </div>
  )
}

/** 배너 — 일정 시간마다 다음 장으로. 점을 눌러 바로 넘길 수도 있다 */
function BannerSlider({ onPick }: { onPick: () => void }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % BANNERS.length), BANNER_MS)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="pl-hbanner">
      <div className="pl-hbanner-track" style={{ transform: `translateX(${-i * 100}%)` }}>
        {BANNERS.map((b, n) => (
          <div key={n} className="pl-hbanner-slide" style={{ background: b.bg }} onClick={onPick}>
            <div className="pl-hbanner-t">{b.t}</div>
            <div className="pl-hbanner-s">{b.s}</div>
          </div>
        ))}
      </div>
      <div className="pl-hbanner-dots">
        {BANNERS.map((_, n) => (
          <button
            key={n} type="button" className={n === i ? 'on' : ''}
            onClick={() => setI(n)} aria-label={`${n + 1}번째 배너`}
          />
        ))}
      </div>
    </div>
  )
}

export default function HomeScreen({ authed, userName, avatar, savedCourses, tab, setTab, onStart, onLogin, onRename, onLogout, onOpenSaved }: {
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
  const marquee = useMemo(() => pickPlaces(places, MARQUEE_N), [places])
  const loading = !failed && !places.length

  return (
    <div className="pl-screen">
      {tab === 'home' ? (
        <div className="pl-home-top">
          <div className="pl-home-logo">NOLDA</div>
          {!authed && <button type="button" className="pl-home-login" onClick={onLogin}>로그인</button>}
          <button type="button" className="pl-home-bell" onClick={soon} aria-label="알림">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6ZM13.7 20a2 2 0 0 1-3.4 0" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="pl-vtitle">{TAB_TITLE[tab]}</div>
      )}

      {(tab === 'home' || tab === 'search') && (
        <div className="pl-home-search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => { if (tab !== 'search') go('search') }}
            placeholder="어디서 놀까요? 장소·동네 검색"
            aria-label="장소 검색"
          />
          {!!q && <button type="button" className="pl-home-clear" onClick={() => setQ('')} aria-label="검색어 지우기">✕</button>}
        </div>
      )}

      <div className="pl-scroll" ref={scrollRef} style={{ padding: '0 0 104px' }}>
        {failed && <div className="pl-home-empty">장소를 불러오지 못했어요. 잠시 뒤 다시 열어주세요.</div>}
        {loading && <div className="pl-home-empty">장소를 불러오는 중이에요…</div>}

        {tab === 'home' && (
          <>
            <div className="pl-home-pad"><BannerSlider onPick={soon} /></div>

            <div className="pl-home-cats" aria-label="장소 종류">
              {KINDS.map((k) => (
                <button
                  key={k} type="button" className="pl-home-cat"
                  onClick={() => { setKind(k); go('search') }}
                >
                  <KindThumb kind={k} size={46} />
                  <span>{k}</span>
                </button>
              ))}
            </div>

            <div className="pl-home-pad"><div className="pl-home-lead">지금 가볼 만한 곳</div></div>

            {/* 같은 목록을 두 번 이어 붙이고 절반만큼 밀어서 끊김 없이 흐르게 한다 */}
            <div className="pl-marquee">
              <div className="pl-marquee-track">
                {[...marquee, ...marquee].map((p, i) => (
                  <div className="pl-marquee-item" key={`${p.id}-${i}`} aria-hidden={i >= marquee.length}>
                    <PlaceCard p={p} onPick={() => setPicked(p)} />
                  </div>
                ))}
              </div>
            </div>

            <div className="pl-home-pad">
              <button type="button" className="pl-home-cta" style={{ marginTop: 26 }} onClick={onStart}>
                {authed && userName ? `${userName}님 취향으로 코스 만들기` : '내 취향으로 코스 만들기'}
              </button>
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
