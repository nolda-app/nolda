// 코스 목록 카드 — 왼쪽 대표 이미지 + 제목 아래 장소 흐름(종류 아이콘, 누르면 화면 중앙에 장소 미리보기)
import { Fragment, useCallback, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import KindThumb from './KindThumb'
import PlacePreview from './PlacePreview'
import type { BuiltCourse } from './logic'

// 취향 '돈을 쓰는 곳' → 대표로 보여줄 장소 종류
const SPEND_KINDS: Record<string, string[]> = { cafe: ['카페'], meal: ['식사'], drink: ['한잔'], play: ['체험', '문화'] }

/** 대표 장소: 코스 성격(spend)에 맞는 장소 중 가장 오래 머무는 곳, 없으면 전체에서 가장 오래 머무는 곳 */
function mainItem(s: BuiltCourse) {
  const want = SPEND_KINDS[s.traits.spend] || []
  const longest = (list: BuiltCourse['items']) => list.reduce((a, b) => (b.mins > a.mins ? b : a))
  const matched = s.items.filter((it) => want.includes(it.kind))
  return longest(matched.length ? matched : s.items)
}

export default function CourseCard({ s, onOpen }: { s: BuiltCourse; onOpen: () => void }) {
  const main = mainItem(s)
  const iconRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [preview, setPreview] = useState<number | null>(null)
  const close = useCallback(() => setPreview(null), [])

  // 아이콘·화살표를 합친 줄 전체가 터치 영역 — 누른 위치에서 가장 가까운 아이콘 선택
  const onFlowClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-index]')
    if (e.detail === 0 && btn) return setPreview(Number(btn.dataset.index)) // 키보드 Enter/Space
    let nearest = 0
    let best = Infinity
    iconRefs.current.forEach((el, i) => {
      const r = el?.getBoundingClientRect()
      const d = r ? Math.abs(r.left + r.width / 2 - e.clientX) : Infinity
      if (d < best) { best = d; nearest = i }
    })
    setPreview(nearest)
  }

  return (
    <div className="pl-coursecard" onClick={onOpen}>
      <div className="pl-cardtop">
        <div className="pl-cardimg">
          <KindThumb kind={main.kind} size={76} pid={main.pid} />
          <span className="pl-cardimg-label">{main.kind}</span>
        </div>
        <div className="pl-cardtop-body">
          <div className="pl-cardmeta">
            {s.estimated && <span className="pl-aibadge">AI 추천</span>}
            <span className="pl-matchtag" style={{ background: s.tintBg, color: s.tintFg }}>{s.matchLabel}</span>
            <span className="pl-cardmeta-t">{s.area} · {s.span}</span>
          </div>
          <div className="pl-coursetitle pl-clamp2">{s.title}</div>
          <div className="pl-flow" onClick={onFlowClick}>
            {s.items.map((it, i) => (
              <Fragment key={i}>
                {i > 0 && <span className="pl-flow-arrow" aria-hidden>→</span>}
                <button
                  type="button"
                  data-index={i}
                  ref={(el) => { iconRefs.current[i] = el }}
                  className={'pl-flow-stop' + (preview === i ? ' on' : '')}
                  title={`${it.kind} · ${it.name}`}
                  aria-label={`${i + 1}번째 장소 ${it.name} 미리보기`}
                  aria-haspopup="dialog"
                >
                  <KindThumb kind={it.kind} size={26} pid={it.pid} />
                </button>
              </Fragment>
            ))}
          </div>
        </div>
      </div>
      <div className="pl-coursewhy pl-clamp2">{s.why}</div>
      <div className="pl-coursefoot">
        <span>{s.moveLine}</span>
        <span style={{ color: 'rgba(20,24,33,.42)' }}>{s.bookLine}</span>
        <span className="pl-cardcost">{s.costLabel}</span>
      </div>
      {preview !== null && (
        <PlacePreview course={s} index={preview} onMove={setPreview} onClose={close} onOpenCourse={onOpen} />
      )}
    </div>
  )
}

/** 코스를 만드는 동안 카드 자리에 보여주는 뼈대 (나중에 이 로딩 구간을 광고 구좌로 쓸 수 있게 카드와 같은 크기) */
export function CourseCardSkeleton() {
  return (
    <div className="pl-coursecard pl-skel" aria-hidden="true">
      <div className="pl-cardtop">
        <i className="pl-skel-box" style={{ width: 76, height: 76, borderRadius: 18 }} />
        <div className="pl-cardtop-body">
          <i className="pl-skel-box" style={{ width: '46%', height: 12 }} />
          <i className="pl-skel-box" style={{ width: '88%', height: 18, marginTop: 10 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {[0, 1, 2, 3].map((i) => <i key={i} className="pl-skel-box" style={{ width: 26, height: 26, borderRadius: 99 }} />)}
          </div>
        </div>
      </div>
      <i className="pl-skel-box" style={{ width: '100%', height: 12, marginTop: 14 }} />
      <i className="pl-skel-box" style={{ width: '72%', height: 12, marginTop: 7 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
        <i className="pl-skel-box" style={{ width: '38%', height: 12 }} />
        <i className="pl-skel-box" style={{ width: '20%', height: 12 }} />
      </div>
    </div>
  )
}
