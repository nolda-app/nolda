// /summary — 이런 취향이 보여요 (분석 결과를 손보고 코스 추천으로)
import { useNavigate } from 'react-router-dom'
import { FIXED_Q_KEYS, Q } from '../planner/data'
import type { TasteTopic } from '../planner/api'
import type { Picks, Report, Taste } from '../planner/logic'
import { BudgetSlider, Chip, HourRange } from '../components/Controls'
import { useAnalysis } from '../state/analysis'

export default function SummaryPage() {
  const a = useAnalysis()
  const navigate = useNavigate()
  return (
    <SummaryScreen
      report={a.report!} taste={a.taste} setTaste={(fn) => a.patch({ taste: fn(a.taste) })}
      tags={a.tags} setTags={(fn) => a.patch({ tags: fn(a.tags) })}
      picks={a.picks} setPicks={(fn) => a.patch({ picks: fn(a.picks) })}
      intent={a.intent} setIntent={(v) => a.patch({ intent: v })}
      toStart={() => { a.restart(); navigate('/start') }}
      rescan={() => navigate('/start')}
      finish={() => { a.finish(); navigate('/courses') }}
      hourRange={a.range} setHourRange={a.setHourRange}
      budget={a.cond.budget} setBudget={(budget) => a.patch({ cond: { ...a.cond, budget } })}
    />
  )
}

/* ── 취향 요약 ─────────────────────────────────────────────── */
function SummaryScreen({ report, taste, setTaste, tags, setTags, picks, setPicks, intent, setIntent, toStart, rescan, finish, hourRange, setHourRange, budget, setBudget }: {
  report: Report
  taste: Taste
  setTaste: (fn: (t: Taste) => Taste) => void
  tags: string[]
  setTags: (fn: (t: string[]) => string[]) => void
  picks: Picks
  setPicks: (fn: (p: Picks) => Picks) => void
  intent: string | null
  setIntent: (v: string | null) => void
  toStart: () => void
  rescan: () => void
  finish: () => void
  hourRange: [number, number]
  setHourRange: (r: [number, number]) => void
  budget: number
  setBudget: (v: number) => void
}) {
  const scanMeta = [
    report.ytLikes || report.ytSubs ? `유튜브 좋아요 ${report.ytLikes} · 구독 ${report.ytSubs}` : '',
    report.total ? `사진 ${report.total}장` : '',
  ].filter(Boolean).join(' · ') + ' 분석'
  // LLM이 주제를 만들어 줬으면 고정 6개만 남기고, 나머지 주제는 이번 분석에서 새로 만든 것으로 채운다
  const dynamic = report.topics.length > 0
  const shown = dynamic ? FIXED_Q_KEYS : (Q.filter((x) => !x.multi).map((x) => x.key) as string[])
  const traitCards = Q.filter((x) => !x.multi && shown.indexOf(x.key) > -1).map((x) => ({
    key: x.key, name: x.name, evidence: report.evidence[x.key] || '',
    opts: x.opts.map((o) => ({ key: o.v, l: o.l, on: (taste as any)[x.key] === o.v })),
  }))
  const tagChips = (Q.find((x) => x.key === 'tags')?.opts || []).map((o) => ({ key: o.v, l: o.l, on: tags.indexOf(o.v) > -1 }))
  const intentChips = [
    { v: null as string | null, l: '기록 그대로' }, { v: 'calm', l: '푹 쉬고 싶어' }, { v: 'active', l: '몸 좀 쓰고파' },
    { v: 'new', l: '새로운 거' }, { v: 'food', l: '맛있는 거' },
  ]
  const toggle = (t: TasteTopic, v: string) => setPicks((st) => {
    const cur = st[t.key] || []
    if (!t.multi) return { ...st, [t.key]: cur[0] === v ? [] : [v] }
    return { ...st, [t.key]: cur.indexOf(v) > -1 ? cur.filter((x) => x !== v) : cur.concat([v]) }
  })

  return (
    <div className="pl-screen">
      <div className="pl-scroll" style={{ padding: '22px 22px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ font: '400 11.5px/1 Pretendard,sans-serif', color: 'rgba(20,24,33,.45)' }}>{scanMeta}</span>
          <div className="pl-pillbtn" onClick={toStart}>처음으로</div>
        </div>
        <div className="pl-h1" style={{ marginTop: 9, fontSize: 26 }}>이런 취향이 보여요</div>
        <div className="pl-sub" style={{ marginTop: 9 }}>다르면 눌러서 바꿔주세요. 바꾼 값으로 다시 추천해요.</div>
        {report.notice && <div className="pl-notice" style={{ marginTop: 12 }}>{report.notice}</div>}

        {report.highlights.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {report.highlights.map((h) => <span key={h} className="pl-tag-mini" style={{ background: '#E4F4EC', color: '#0C5A42' }}>{h}</span>)}
          </div>
        )}

        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {traitCards.map((t) => (
            <div key={t.key} className="pl-traitcard">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ font: '600 11.5px/1 Pretendard,sans-serif', color: 'rgba(20,24,33,.42)' }}>{t.name}</span>
                <span style={{ marginLeft: 'auto', font: '600 11px/1 Pretendard,sans-serif', color: '#00845A' }}>{t.evidence}</span>
              </div>
              {t.key === 'hour' ? (
                <HourRange range={hourRange} onChange={setHourRange} />
              ) : (
                <div style={{ marginTop: 11, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {t.opts.map((o) => (
                    <Chip key={o.key} label={o.l} on={o.on} onClick={() => setTaste((st) => ({ ...st, [t.key]: o.key }))} />
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="pl-traitcard">
            <span style={{ font: '600 11.5px/1 Pretendard,sans-serif', color: 'rgba(20,24,33,.42)' }}>1인 예산</span>
            <BudgetSlider value={budget} onChange={setBudget} />
          </div>
          {!dynamic && (
            <div className="pl-traitcard">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ font: '600 11.5px/1 Pretendard,sans-serif', color: 'rgba(20,24,33,.42)' }}>이런 것들이 자주 보였어요</span>
                <span style={{ marginLeft: 'auto', font: '600 11px/1 Pretendard,sans-serif', color: '#00845A' }}>{report.evidence.tags}</span>
              </div>
              <div style={{ marginTop: 11, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {tagChips.map((c) => (
                  <Chip key={c.key} label={c.l} on={c.on} onClick={() => setTags((st) => (st.indexOf(c.key) > -1 ? st.filter((x) => x !== c.key) : st.concat([c.key])))} />
                ))}
              </div>
            </div>
          )}
          {/* 이번 분석에서 새로 만든 주제 — 기록이 달라지면 주제와 선택지도 달라진다 */}
          {report.topics.map((t) => (
            <div key={t.key} className="pl-traitcard">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ font: '600 11.5px/1 Pretendard,sans-serif', color: 'rgba(20,24,33,.42)' }}>{t.name}</span>
                <span style={{ marginLeft: 'auto', font: '600 11px/1 Pretendard,sans-serif', color: '#00845A' }}>{t.evidence}</span>
              </div>
              <div style={{ marginTop: 11, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {t.opts.map((o) => (
                  <Chip key={o.v} label={o.l} on={(picks[t.key] || []).indexOf(o.v) > -1} onClick={() => toggle(t, o.v)} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {!dynamic && (
        <div className="pl-intentbox">
          <div style={{ font: '800 15.5px/1.35 Pretendard,sans-serif', color: '#141821' }}>오늘은 어떤 걸 해볼까요?</div>
          <div style={{ marginTop: 6, font: '400 12.5px/1.6 Pretendard,sans-serif', color: 'rgba(20,24,33,.5)' }}>취향 분석은 예전 기록 기준이에요.<br />오늘 기분에 맞는 걸 고르면 그 코스를 위로 올려드려요.</div>
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {intentChips.map((c) => (
              <Chip key={String(c.v)} label={c.l} on={(intent || null) === c.v} onClick={() => setIntent(c.v)} />
            ))}
          </div>
        </div>
        )}
        <div className="pl-skip" onClick={rescan}>연결 항목 바꿔서 다시 분석</div>
      </div>
      <div className="pl-foot">
        <div className="pl-cta" onClick={finish}>AI 코스 추천 받기</div>
      </div>
    </div>
  )
}
