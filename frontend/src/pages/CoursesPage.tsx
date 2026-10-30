// /courses — 조건 칩 + AI 코스 목록. 분석 전이면 고정 코스와 '취향 분석하기'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import CourseCard, { CourseCardSkeleton } from '../planner/CourseCards'
import { COND, DEFAULT_COND, Q, label as labelOf } from '../planner/data'
import { matchCond } from '../planner/logic'
import type { BuiltCourse, Taste } from '../planner/logic'
import { useAnalysis, useBuilt } from '../state/analysis'
import type { AiState } from '../state/analysis'

const GREEN = '#00A46E'

export default function CoursesPage() {
  const a = useAnalysis()
  const { list } = useBuilt()
  const navigate = useNavigate()
  const location = useLocation()
  const [sheetKey, setSheetKey] = useState<string | null>(null)
  // 결과 화면에 처음 들어오면 AI 코스 생성 (실패해도 고정 코스는 그대로 보임)
  useEffect(() => {
    if (a.hasResult && a.ai.status === 'idle') a.generateAi()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 상태가 idle로 바뀔 때만
  }, [a.hasResult, a.ai.status])
  return (
    <SearchTab
      cond={a.cond} setCond={(fn) => a.patch({ cond: fn(a.cond) })}
      sheet={COND.find((c) => c.key === sheetKey) || null} setSheetKey={setSheetKey}
      built={list} filtered={list.filter((c) => matchCond(c, a.cond))}
      taste={a.effTaste} tags={a.effTags} hasResult={a.hasResult}
      restart={() => { a.restart(); navigate('/start') }}
      openCourse={(id) => navigate('/course/' + id, { state: { background: location } })}
      ai={a.ai} generateAi={a.generateAi}
    />
  )
}

function SearchTab({ cond, setCond, sheet, setSheetKey, built, filtered, taste, tags, hasResult, restart, openCourse, ai, generateAi }: {
  cond: typeof DEFAULT_COND
  setCond: (fn: (c: typeof DEFAULT_COND) => typeof DEFAULT_COND) => void
  sheet: (typeof COND)[number] | null
  setSheetKey: (k: string | null) => void
  built: BuiltCourse[]
  filtered: BuiltCourse[]
  taste: Taste
  tags: string[]
  hasResult: boolean
  restart: () => void
  openCourse: (id: string) => void
  ai: AiState
  generateAi: () => void
}) {
  const profileLine = hasResult
    ? '기록에서 읽은 취향 · ' + [labelOf(Q[2].opts, taste.hour), labelOf(Q[3].opts, taste.spend)].filter(Boolean).join(' · ') + (tags.length ? ' · ' + tags.join('·') : '')
    : '아직 취향 분석 전이라 기본 코스를 보여드려요'
  const resultHead = !hasResult ? '이런 코스는 어때요?' : ai.status === 'loading' || ai.status === 'idle' ? '코스를 만들고 있어요' : filtered.length ? `추천 코스 ${filtered.length}개` : '조건에 맞는 코스가 없어요'
  // 시간·예산은 요약 화면 막대에서 정하므로 코스 화면 칩·초기화 대상에서 뺌
  const condChips = COND.filter((c) => c.key !== 'hours' && c.key !== 'budget')
  const resetCond = () => setCond((c) => ({ ...DEFAULT_COND, budget: c.budget }))
  const condDirty = condChips.some((c) => (cond as any)[c.key] !== (DEFAULT_COND as any)[c.key])
  const emptyHint = cond.budget && built.filter((c) => matchCond(c, { ...cond, budget: 0 })).length
    ? '예산을 조금 올리면 볼 수 있는 코스가 있어요'
    : cond.hours && built.filter((c) => matchCond(c, { ...cond, hours: 0 })).length
      ? '시간을 조금 늘리면 볼 수 있는 코스가 있어요'
      : '지역이나 시간 조건을 넓혀보세요'

  return (
    <div className="pl-screen">
      <div style={{ flex: 'none', padding: '22px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div className="pl-pillbtn" onClick={restart}>{hasResult ? '다시 분석' : '취향 분석하기'}</div>
        </div>
        <div style={{ marginTop: 6, textAlign: 'center' }}>
          <div style={{ font: '400 11.5px/1.4 Pretendard,sans-serif', color: 'rgba(20,24,33,.45)' }}>{profileLine}</div>
          <div className="pl-h1" style={{ marginTop: 8, fontSize: 25 }}>{resultHead}</div>
        </div>
        <div className="pl-chipbar">
          {condChips.map((c) => {
            const on = (cond as any)[c.key] !== (DEFAULT_COND as any)[c.key]
            return (
              <div key={c.key} className="pl-condchip" style={{ background: on ? '#141821' : '#fff', borderColor: on ? '#141821' : 'rgba(20,24,33,.1)', color: on ? '#fff' : 'rgba(20,24,33,.7)' }} onClick={() => setSheetKey(c.key)}>
                <span style={{ opacity: 0.5, fontWeight: 500 }}>{c.name}</span>{labelOf(c.opts, (cond as any)[c.key])}<span style={{ opacity: 0.55 }}>▾</span>
              </div>
            )
          })}
          {condDirty && <div className="pl-condchip pl-condchip-reset" onClick={resetCond}>초기화</div>}
        </div>
      </div>
      <div className="pl-scroll" style={{ padding: '16px 20px 96px', borderTop: '1px solid rgba(20,24,33,.06)' }}>
        <AiBanner ai={ai} generateAi={generateAi} courses={built} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ai.status === 'loading'
            ? [0, 1, 2, 3].map((i) => <CourseCardSkeleton key={i} />)
            : filtered.map((s) => (
              <CourseCard key={s.id} s={s} onOpen={() => openCourse(s.id)} />
            ))}
        </div>
        {filtered.length === 0 && (!hasResult || ai.status === 'done' || ai.status === 'error') && (
          <div style={{ padding: '40px 22px', textAlign: 'center' }}>
            <div style={{ font: '700 15.5px/1.5 Pretendard,sans-serif', color: '#141821' }}>이 조건에 맞는 코스가 없어요</div>
            <div style={{ marginTop: 7, font: '400 13px/1.6 Pretendard,sans-serif', color: 'rgba(20,24,33,.5)' }}>{emptyHint}</div>
            <div className="pl-cta" style={{ display: 'inline-block', marginTop: 16, padding: '13px 20px', borderRadius: 99 }} onClick={resetCond}>조건 초기화</div>
          </div>
        )}
      </div>

      {sheet && (
        <div className="pl-sheet-wrap">
          <div className="pl-sheet-backdrop" onClick={() => setSheetKey(null)} />
          <div className="pl-sheet">
            <div className="pl-sheet-handle" />
            <div className="pl-h1" style={{ fontSize: 19 }}>{sheet.title}</div>
            <div className="pl-sub" style={{ marginTop: 6 }}>{sheet.hint}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
              {sheet.opts.map((o) => {
                const on = (cond as any)[sheet.key] === o.v
                const n = sheet.key === 'people' ? '' : built.filter((c) => matchCond(c, { ...cond, [sheet.key]: o.v } as any)).length
                return (
                  <div key={String(o.v)} className="pl-sheetopt" style={{ background: on ? GREEN : '#fff', borderColor: on ? GREEN : 'rgba(20,24,33,.12)', color: on ? '#fff' : '#2c3444' }}
                    onClick={() => { setCond((st) => ({ ...st, [sheet.key]: o.v })); setSheetKey(null) }}>
                    {o.l}{n !== '' && <span style={{ marginLeft: 7, opacity: 0.55, fontWeight: 500 }}>{n}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AiBanner({ ai, generateAi, courses }: { ai: AiState; generateAi: () => void; courses: BuiltCourse[] }) {
  const taste = courses.filter((c) => (c.source || 'taste') === 'taste').length
  if (ai.status === 'idle') return null
  if (ai.status === 'loading') {
    return (
      <div className="pl-aibanner">
        <span className="pl-spinner" />
        <div style={{ flex: 1 }}>
          <div className="pl-aibanner-t">취향에 맞는 코스를 AI가 만들고 있어요</div>
          <div className="pl-aibanner-s">고른 시간을 꽉 채우는 코스 4개를 짜는 중 · 30초~1분 정도 걸려요</div>
        </div>
      </div>
    )
  }
  const failed = ai.status === 'error'
  return (
    <div className={failed ? 'pl-aibanner pl-aibanner-err' : 'pl-aibanner'}>
      <div style={{ flex: 1 }}>
        <div className="pl-aibanner-t">{failed ? 'AI 코스를 만들지 못해 기본 코스를 보여드려요' : taste === courses.length ? `취향 맞춤 코스 ${taste}개` : `취향 맞춤 ${taste}개 · 추가 추천 ${courses.length - taste}개`}</div>
        <div className="pl-aibanner-s">
          {failed ? ai.error : '체류 시간·가격은 추정이에요 · 조건을 바꿨다면 다시 만들어 보세요'}
        </div>
      </div>
      <div className="pl-pillbtn" onClick={generateAi}>{failed ? '다시 시도' : '다시 만들기'}</div>
    </div>
  )
}
