// 요약 화면의 입력 조각 — 칩, 시간대 막대, 예산 막대
import { Q, label as labelOf } from '../planner/data'
import { hourBucket } from '../state/analysis'

const GREEN = '#00A46E'

/* 시간대 막대 — 6시~24시 1시간 눈금, 시작·끝 손잡이 2개. 취향값은 시작 시각의 4구간(아침·낮·노을 무렵·밤)으로 저장 */
const HOUR_MIN = 6, HOUR_MAX = 24
const HOUR_SPAN = HOUR_MAX - HOUR_MIN
const hourText = (h: number) => (h === 24 ? '자정' : h === 12 ? '낮 12시' : h < 12 ? `오전 ${h}시` : `오후 ${h - 12}시`)
// 손잡이 중심이 움직이는 구간(양끝 12px 안쪽)에 맞춘 위치 — ratio 0~1
const trackPos = (ratio: number) => `calc(12px + (100% - 24px) * ${ratio})`
const hourPos = (h: number) => trackPos((h - HOUR_MIN) / HOUR_SPAN)

export function HourRange({ range: [start, end], onChange }: { range: [number, number]; onChange: (r: [number, number]) => void }) {
  const bucket = hourBucket(start)
  const update = (s: number, e: number) => onChange([s, e])
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ font: '800 17px/1.2 Pretendard,sans-serif', letterSpacing: '-.02em', color: '#141821' }}>{hourText(start)} ~ {hourText(end)}</span>
        <span style={{ font: '600 12.5px/1 Pretendard,sans-serif', color: GREEN }}>{end - start}시간 · {labelOf(Q[2].opts, bucket)}</span>
      </div>
      <div className="pl-range">
        <div className="pl-range-track" />
        <div className="pl-range-fill" style={{ left: hourPos(start), width: `calc((100% - 24px) * ${(end - start) / HOUR_SPAN})` }} />
        <input
          type="range" min={HOUR_MIN} max={HOUR_MAX} step={1} value={start}
          aria-label="시작 시간" aria-valuetext={hourText(start)}
          style={{ zIndex: start >= HOUR_MAX - 1 ? 3 : 2 }} // 끝까지 밀었을 때 시작 손잡이가 아래에 깔리지 않게
          onChange={(e) => update(Math.min(Number(e.target.value), end - 1), end)}
        />
        <input
          type="range" min={HOUR_MIN} max={HOUR_MAX} step={1} value={end}
          aria-label="끝 시간" aria-valuetext={hourText(end)}
          onChange={(e) => update(start, Math.max(Number(e.target.value), start + 1))}
        />
      </div>
      <div className="pl-range-ticks" aria-hidden>
        {Array.from({ length: HOUR_SPAN + 1 }, (_, i) => HOUR_MIN + i).map((h) => (
          <span key={h} className={h % 3 === 0 ? 'major' : ''} style={{ left: hourPos(h) }}>
            {h % 3 === 0 && <em>{h}</em>}
          </span>
        ))}
      </div>
    </div>
  )
}

/* 1인 예산 막대 — 1만~20만원 5천원 단위, 1만원마다 눈금. 맨 오른쪽(20만원)은 '상관없음'(budget 0) */
const BUDGET_MIN = 10000, BUDGET_MAX = 200000, BUDGET_STEP = 5000
const manwon = (v: number) => `${v / 10000}만원`

export function BudgetSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const at = value ? Math.min(Math.max(value, BUDGET_MIN), BUDGET_MAX) : BUDGET_MAX
  const unlimited = at >= BUDGET_MAX
  const ratio = (at - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)
  const text = unlimited ? '상관없음' : `${manwon(at)} 이하`
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ font: '800 17px/1.2 Pretendard,sans-serif', letterSpacing: '-.02em', color: '#141821' }}>{text}</span>
        <span style={{ font: '600 12.5px/1 Pretendard,sans-serif', color: GREEN }}>{unlimited ? '끝까지 밀면 제한 없음' : '코스 전체 1인 기준'}</span>
      </div>
      <div className="pl-range">
        <div className="pl-range-track" />
        <div className="pl-range-fill" style={{ left: '12px', width: `calc((100% - 24px) * ${ratio})` }} />
        <input
          type="range" min={BUDGET_MIN} max={BUDGET_MAX} step={BUDGET_STEP} value={at}
          aria-label="1인 예산" aria-valuetext={text}
          onChange={(e) => {
            const v = Number(e.target.value)
            onChange(v >= BUDGET_MAX ? 0 : v)
          }}
        />
      </div>
      <div className="pl-range-ticks" aria-hidden>
        {Array.from({ length: (BUDGET_MAX - BUDGET_MIN) / 10000 + 1 }, (_, i) => BUDGET_MIN + i * 10000).map((v) => {
          const major = v === BUDGET_MIN || v % 50000 === 0
          return (
            <span key={v} className={major ? 'major' : ''} style={{ left: trackPos((v - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) }}>
              {major && <em>{v === BUDGET_MAX ? '20만+' : v / 10000 + '만'}</em>}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <div className="pl-chip" style={{ background: on ? GREEN : '#fff', borderColor: on ? GREEN : 'rgba(20,24,33,.12)', color: on ? '#fff' : '#2c3444' }} onClick={onClick}>
      {label}
    </div>
  )
}
