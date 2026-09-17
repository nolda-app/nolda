// 분석 중 미니 게임(장소 카드 스와이프) + 분석 완료 취향 유형 발표
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { allPlaces, loadPlaces } from './geo'
import type { Place } from './geo'
import type { Swipe, TasteType } from './tasteType'

const DECK_SIZE = 12
const DECK_KINDS = ['카페', '산책', '식사', '문화', '체험', '한잔']
const SWIPE_PX = 90 // 이만큼 밀면 넘어감

/** 사진 있는 장소를 종류별로 돌아가며 뽑은 카드 묶음 (매번 조금씩 다르게) */
function makeDeck(places: Place[]): Place[] {
  const withImg = places.filter((p) => p.img && p.kind && DECK_KINDS.includes(p.kind))
  const pools = DECK_KINDS.map((k) => withImg.filter((p) => p.kind === k).sort(() => Math.random() - 0.5))
  const deck: Place[] = []
  for (let i = 0; deck.length < DECK_SIZE && i < 40; i++) {
    const p = pools[i % pools.length].pop()
    if (p) deck.push(p)
  }
  return deck
}

const shortArea = (a?: string | null) => (a ? a.replace(/동$/, '') : '')

export function SwipeDeck({ onSwipe, onEmpty }: {
  onSwipe: (s: Swipe) => void
  onEmpty?: () => void
}) {
  const [deck, setDeck] = useState<Place[]>(() => makeDeck(allPlaces()))
  const [idx, setIdx] = useState(0)
  const [drag, setDrag] = useState(0)
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0)
  const start = useRef<number | null>(null)

  // 장소 목록을 아직 못 받았으면 받아서 카드 만들기
  useEffect(() => {
    if (deck.length) return
    loadPlaces().then(() => setDeck(makeDeck(allPlaces()))).catch(() => {})
  }, [deck.length])

  const card = deck[idx]
  const next = deck[idx + 1]
  useEffect(() => { if (deck.length && !card) onEmpty?.() }, [card, deck.length, onEmpty])

  const decide = (liked: boolean) => {
    if (!card || leaving) return
    onSwipe({ id: card.id, name: card.name, kind: card.kind || '', area: card.area, tags: card.tags || [], liked })
    setLeaving(liked ? 1 : -1)
    window.setTimeout(() => { setIdx((i) => i + 1); setDrag(0); setLeaving(0) }, 260)
  }

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (leaving) return
    start.current = e.clientX
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: ReactPointerEvent<HTMLDivElement>) => { if (start.current !== null) setDrag(e.clientX - start.current) }
  const up = () => {
    if (start.current === null) return
    start.current = null
    if (Math.abs(drag) > SWIPE_PX) decide(drag > 0)
    else setDrag(0)
  }

  if (!deck.length) return <div className="sg-empty">장소 카드를 불러오고 있어요</div>
  if (!card) return null

  const x = leaving ? leaving * 480 : drag
  return (
    <div className="sg-deck">
      {next && <PlaceCard key={next.id} place={next} className="sg-card sg-card--next" />}
      <PlaceCard
        key={card.id}
        place={card}
        className={'sg-card' + (start.current === null ? ' is-settle' : '')}
        style={{ transform: `translateX(${x}px) rotate(${x / 18}deg)` }}
        like={Math.max(0, Math.min(1, x / SWIPE_PX))}
        nope={Math.max(0, Math.min(1, -x / SWIPE_PX))}
        handlers={{ onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up }}
      />
      <div className="sg-actions">
        <button type="button" className="sg-btn sg-btn--nope" onClick={() => decide(false)} aria-label="별로예요">✕</button>
        <span className="sg-count">{idx + 1} / {deck.length}</span>
        <button type="button" className="sg-btn sg-btn--like" onClick={() => decide(true)} aria-label="좋아요">♥</button>
      </div>
    </div>
  )
}

function PlaceCard({ place, className, style, like = 0, nope = 0, handlers }: {
  place: Place
  className: string
  style?: CSSProperties
  like?: number
  nope?: number
  handlers?: Record<string, (e: ReactPointerEvent<HTMLDivElement>) => void>
}) {
  return (
    <div className={className} style={style} {...handlers}>
      <img src={place.img || ''} alt="" draggable={false} />
      <div className="sg-shade" />
      <span className="sg-stamp sg-stamp--like" style={{ opacity: like }}>좋아요</span>
      <span className="sg-stamp sg-stamp--nope" style={{ opacity: nope }}>별로</span>
      <div className="sg-info">
        <div className="sg-meta">{place.kind}{shortArea(place.area) && ` · ${shortArea(place.area)}`}</div>
        <div className="sg-name">{place.name}</div>
        {!!place.tags?.length && <div className="sg-tags">{place.tags.slice(0, 3).map((t) => <span key={t}>#{t}</span>)}</div>}
      </div>
    </div>
  )
}

export function TypeReveal({ type, areas, tags, liked, onResult }: {
  type: TasteType
  areas: string[]
  tags: string[]
  liked: number
  onResult: () => void
}) {
  const [flipped, setFlipped] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setFlipped(true), 350)
    return () => clearTimeout(id)
  }, [])
  const confetti = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    left: `${(i * 37) % 100}%`, delay: `${0.6 + (i % 6) * 0.08}s`, hue: (i * 47) % 360, rot: (i * 53) % 360,
  })), [])

  return (
    <div className="sg-reveal">
      <div className="sg-confetti" aria-hidden>
        {confetti.map((c, i) => <i key={i} style={{ left: c.left, animationDelay: c.delay, background: `hsl(${c.hue} 80% 65%)`, rotate: `${c.rot}deg` }} />)}
      </div>
      <div className={'sg-flip' + (flipped ? ' is-flipped' : '')}>
        <div className="sg-face sg-face--front">?</div>
        <div className="sg-face sg-face--back" style={{ '--tc': type.color } as CSSProperties}>
          <div className="sg-type-emoji">{type.emoji}</div>
          <div className="sg-type-you">당신은</div>
          <div className="sg-type-name">{type.name}</div>
          <div className="sg-type-line">{type.line}</div>
          <div className="sg-type-rows">
            <div><b>잘 맞는 동네</b>{areas.map(shortArea).join(' · ')}</div>
            <div><b>좋아하는 곳</b>{type.kinds.join(' · ')}</div>
            {!!tags.length && <div><b>취향 키워드</b>{tags.slice(0, 3).join(' · ')}</div>}
          </div>
          {liked > 0 && <div className="sg-type-foot">마음에 든 장소 {liked}곳도 코스 추천에 반영할게요</div>}
        </div>
      </div>
      <button type="button" className="sg-go" onClick={onResult}>내 취향 자세히 보기 <span>›</span></button>
    </div>
  )
}
