import NaverMap from './NaverMap'
import { placeGeo } from './geo'
import { WALK_PATHS } from './routes'
import { useEffect, useMemo, useRef, useState } from 'react'
import { COND, COURSES, DEFAULT_COND, PHOTOS, CARDS, Q, label as labelOf } from './data'
import { analyze, build, matchCond, scanSteps } from './logic'
import type { Taste, BuiltCourse } from './logic'
import './planner.css'

type ScanPhase = 'ask' | 'scanning' | 'summary'
type Tab = 'search' | 'saved'

interface AuthState {
  mode: 'login' | 'signup'
  name: string
  email: string
  pw: string
  error: string
  user: { name: string; email: string } | null
  skipped: boolean
}

const GREEN = '#00A46E'

export default function PlannerApp() {
  const [auth, setAuthState] = useState<AuthState>({ mode: 'login', name: '', email: '', pw: '', error: '', user: null, skipped: false })
  const [sources, setSources] = useState({ cards: true, photos: true })
  const [scan, setScan] = useState<ScanPhase>('ask')
  const [scanN, setScanN] = useState(0)
  const [report, setReport] = useState<ReturnType<typeof analyze> | null>(null)
  const [taste, setTaste] = useState<Taste>({})
  const [tags, setTags] = useState<string[]>([])
  const [intent, setIntent] = useState<string | null>(null)
  const [cond, setCond] = useState({ ...DEFAULT_COND })
  const [sheetKey, setSheetKey] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [saved, setSaved] = useState<string[]>([])
  const [booked, setBooked] = useState<string[]>([])
  const [tab, setTab] = useState<Tab>('search')
  const [done, setDone] = useState(false)

  const timerRef = useRef<number | null>(null)
  const t0Ref = useRef(0)

  const setAuth = (o: Partial<AuthState>) => setAuthState((st) => ({ ...st, ...o }))
  const authed = !!auth.user || auth.skipped

  const finishScan = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    const a = analyze(sources)
    setReport(a)
    setTaste(a.taste)
    setTags(a.tags)
    setCond((c) => ({ ...c, people: a.party, budget: a.budgetBand }))
    setScan('summary')
  }

  const startScan = () => {
    if (!sources.cards && !sources.photos) return
    setScan('scanning')
    setScanN(0)
    if (timerRef.current) clearInterval(timerRef.current)
    const total = scanSteps(sources)
    t0Ref.current = Date.now()
    timerRef.current = window.setInterval(() => {
      setScanN((n) => {
        const next = Math.max(n + 1, Math.min(total, Math.floor((Date.now() - t0Ref.current) / 130)))
        if (next >= total) {
          if (timerRef.current) clearInterval(timerRef.current)
          finishScan()
        }
        return next
      })
    }, 130)
  }

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && scan === 'scanning') finishScan()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan])

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const toStart = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setScan('ask'); setScanN(0); setReport(null); setIntent(null); setTaste({}); setTags([]); setDone(false)
    setCond({ ...DEFAULT_COND }); setSheetKey(null); setOpenId(null); setTab('search')
    setAuthState({ mode: 'login', name: '', email: '', pw: '', error: '', user: null, skipped: false })
  }
  const skipScan = () => {
    setTaste({ mood: 'calm', crowd: 'mid', hour: 'noon', spend: 'cafe', pace: 'walk' })
    setTags([]); setDone(true); setScan('summary')
  }
  const rescan = () => { setScan('ask'); setScanN(0); setReport(null) }
  const restart = () => {
    setScan('ask'); setScanN(0); setReport(null); setIntent(null); setTaste({}); setTags([]); setDone(false)
    setCond({ ...DEFAULT_COND }); setSheetKey(null); setOpenId(null); setTab('search')
  }

  const submitAuth = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(auth.email)) return setAuth({ error: '이메일 주소를 다시 확인해 주세요.' })
    if (auth.pw.length < 8) return setAuth({ error: '비밀번호는 8자 이상으로 입력해 주세요.' })
    setAuth({ user: { name: auth.name || auth.email.split('@')[0], email: auth.email }, error: '', pw: '' })
  }

  const built: BuiltCourse[] = useMemo(
    () => COURSES.map((c) => build(c, { taste, tags, intent, people: cond.people, booked })).sort((a, b) => b.score - a.score),
    [taste, tags, intent, cond.people, booked],
  )
  const filtered = built.filter((c) => matchCond(c, cond))
  const openCourse = built.find((c) => c.id === openId) || null
  const sheet = COND.find((c) => c.key === sheetKey) || null

  if (!authed) {
    return (
      <AuthScreen auth={auth} setAuth={setAuth} submitAuth={submitAuth} />
    )
  }
  if (!done && scan === 'ask') {
    return <DataSourceScreen sources={sources} setSources={setSources} toStart={toStart} startScan={startScan} skipScan={skipScan} />
  }
  if (!done && scan === 'scanning') {
    return (
      <ScanningScreen
        sources={sources} scanN={scanN}
        cancelScan={() => { if (timerRef.current) clearInterval(timerRef.current); setScan('ask'); setScanN(0) }}
      />
    )
  }
  if (!done && scan === 'summary' && report) {
    return (
      <SummaryScreen
        report={report} taste={taste} setTaste={setTaste} tags={tags} setTags={setTags}
        intent={intent} setIntent={setIntent} toStart={toStart} rescan={rescan}
        finish={() => setDone(true)} courseCount={built.length}
      />
    )
  }

  return (
    <div className="pl-app">
      {tab === 'search' && (
        <SearchTab
          cond={cond} setCond={setCond} sheet={sheet} setSheetKey={setSheetKey}
          built={built} filtered={filtered} taste={taste} tags={tags} restart={restart}
          openCourse={(id) => setOpenId(id)}
        />
      )}
      {tab === 'saved' && (
        <SavedTab
          savedBuilt={saved.map((id) => built.find((c) => c.id === id)).filter(Boolean) as BuiltCourse[]}
          people={cond.people}
          openCourse={(id) => setOpenId(id)}
          remove={(id) => setSaved((s) => s.filter((x) => x !== id))}
          goSearch={() => setTab('search')}
        />
      )}
      <TabBar tab={tab} savedCount={saved.length} setTab={setTab} toStart={toStart} />
      {openCourse && (
        <CourseModal
          course={openCourse}
          isSaved={saved.indexOf(openCourse.id) > -1}
          booked={booked}
          toggleBook={(key) => setBooked((b) => (b.indexOf(key) > -1 ? b.filter((x) => x !== key) : b.concat([key])))}
          save={() => {
            if (saved.indexOf(openCourse.id) > -1) { setOpenId(null); setTab('saved'); return }
            setSaved((s) => s.concat([openCourse.id]))
          }}
          close={() => setOpenId(null)}
        />
      )}
    </div>
  )
}

/* ── 로그인 / 회원가입 ─────────────────────────────────────── */
function AuthScreen({ auth, setAuth, submitAuth }: {
  auth: AuthState
  setAuth: (o: Partial<AuthState>) => void
  submitAuth: () => void
}) {
  const signup = auth.mode === 'signup'
  const emailBd = auth.error.includes('이메일') ? '#e0574a' : 'rgba(20,24,33,.1)'
  const pwBd = auth.error.includes('비밀번호') ? '#e0574a' : 'rgba(20,24,33,.1)'
  const socials = [
    { key: 'kakao', l: '카카오로 계속하기', mark: 'K', bg: '#FEE500', bd: '#FEE500', fg: '#191600', dot: 'rgba(0,0,0,.82)', dotFg: '#FEE500' },
    { key: 'google', l: 'Google로 계속하기', mark: 'G', bg: '#fff', bd: 'rgba(20,24,33,.12)', fg: '#2c3444', dot: 'rgba(20,24,33,.06)', dotFg: '#2c3444' },
  ]
  return (
    <div className="pl-screen">
      <div className="pl-scroll" style={{ padding: '48px 26px 20px' }}>
        <div className="pl-badge">
          <div className="pl-badge-t">NOLDA</div>
          <div className="pl-badge-s">놀다</div>
        </div>
        <div className="pl-h1" style={{ whiteSpace: 'pre-line' }}>
          {signup ? '취향에 맞는 코스,\n저장해두고 꺼내 봐요' : '다시 왔네요!\n오늘은 뭐 하고 놀까요'}
        </div>
        <div className="pl-sub">
          {signup ? '가입하면 저장한 코스와 취향이 기기 간에 따라와요.' : '이메일로 로그인하면 저장한 코스가 그대로 있어요.'}
        </div>

        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 11 }}>
          {signup && (
            <Field label="이름" value={auth.name} onChange={(v) => setAuth({ name: v, error: '' })} placeholder="어떻게 부를까요?" />
          )}
          <Field label="이메일" value={auth.email} onChange={(v) => setAuth({ email: v, error: '' })} placeholder="you@example.com" borderColor={emailBd} type="email" />
          <Field label="비밀번호" value={auth.pw} onChange={(v) => setAuth({ pw: v, error: '' })} placeholder="8자 이상" borderColor={pwBd} type="password" />
          {auth.error && <div className="pl-error">{auth.error}</div>}
        </div>

        <div className="pl-cta" onClick={submitAuth}>{signup ? '가입하고 시작하기' : '로그인'}</div>

        <div className="pl-divider"><span /><span className="pl-divider-l">간편하게</span><span /></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {socials.map((p) => (
            <div key={p.key} className="pl-social" style={{ background: p.bg, border: `1px solid ${p.bd}` }}
              onClick={() => setAuth({ user: { name: '게스트', email: p.key + '@social' }, error: '' })}>
              <span className="pl-social-dot" style={{ background: p.dot, color: p.dotFg }}>{p.mark}</span>
              <span style={{ color: p.fg, fontWeight: 600, fontSize: 14.5 }}>{p.l}</span>
            </div>
          ))}
        </div>
        <div className="pl-skip" onClick={() => setAuth({ skipped: true })}>로그인 없이 둘러보기</div>
      </div>
      <div className="pl-authfoot">
        <span style={{ color: 'rgba(20,24,33,.5)' }}>{signup ? '이미 계정이 있나요? ' : '처음이신가요? '}</span>
        <span className="pl-link" onClick={() => setAuth({ mode: signup ? 'login' : 'signup', error: '' })}>{signup ? '로그인' : '회원가입'}</span>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, borderColor, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; borderColor?: string; type?: string
}) {
  return (
    <div>
      <div className="pl-field-label">{label}</div>
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="pl-input" style={{ borderColor: borderColor || 'rgba(20,24,33,.1)' }}
      />
    </div>
  )
}

/* ── 데이터 소스 연결 ──────────────────────────────────────── */
function DataSourceScreen({ sources, setSources, toStart, startScan, skipScan }: {
  sources: { cards: boolean; photos: boolean }
  setSources: (fn: (s: { cards: boolean; photos: boolean }) => { cards: boolean; photos: boolean }) => void
  toStart: () => void
  startScan: () => void
  skipScan: () => void
}) {
  const cards = [
    { key: 'cards' as const, t: '카드내역', mark: '카', count: `최근 7일 결제 ${CARDS.length}건`, reads: ['가맹점 업종', '금액대', '결제 시간'] },
    { key: 'photos' as const, t: '사진첩', mark: '사', count: `최근 7일 사진 ${PHOTOS.length}장`, reads: ['찍은 시간', '장소 종류', '재방문', '동행 수'] },
  ]
  const nSrc = (sources.cards ? 1 : 0) + (sources.photos ? 1 : 0)
  const startLabel = nSrc === 2 ? '둘 다 연결하고 분석 시작' : nSrc === 1 ? (sources.cards ? '카드내역만 연결하고 시작' : '사진첩만 연결하고 시작') : '연결할 항목을 하나 이상 골라주세요'

  return (
    <div className="pl-screen">
      <div className="pl-scroll" style={{ padding: '42px 26px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="pl-step">STEP 1</div>
          <div className="pl-pillbtn" onClick={toStart}>로그인 화면</div>
        </div>
        <div className="pl-h1" style={{ marginTop: 12 }}>지난 일주일의 기록으로<br />취향을 읽어드릴게요</div>
        <div className="pl-sub" style={{ marginTop: 12 }}>
          질문에 답하지 않아도 돼요. <b style={{ color: '#141821' }}>카드내역</b>은 어디에 얼마를 쓰는지, <b style={{ color: '#141821' }}>사진첩</b>은 언제 어디서 시간을 보내는지 알려줍니다. 둘 다 연결하면 가장 정확해요.
        </div>

        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 11 }}>
          {cards.map((c) => {
            const on = sources[c.key]
            return (
              <div key={c.key} className="pl-card" style={{ borderColor: on ? GREEN : 'rgba(20,24,33,.1)', cursor: 'pointer' }}
                onClick={() => setSources((st) => ({ ...st, [c.key]: !st[c.key] }))}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <div className="pl-icon34" style={{ background: on ? GREEN : 'rgba(20,24,33,.06)', color: on ? '#fff' : 'rgba(20,24,33,.45)' }}>{c.mark}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: '800 16px/1.3 Pretendard,sans-serif', letterSpacing: '-.02em', color: '#141821' }}>{c.t}</div>
                    <div style={{ marginTop: 3, font: '400 12px/1.4 Pretendard,sans-serif', color: 'rgba(20,24,33,.48)' }}>{c.count}</div>
                  </div>
                  <div className="pl-switch" style={{ background: on ? GREEN : 'rgba(20,24,33,.16)', justifyContent: on ? 'flex-end' : 'flex-start' }}>
                    <div className="pl-switch-knob" />
                  </div>
                </div>
                <div style={{ marginTop: 13, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {c.reads.map((r) => <span key={r} className="pl-tag-mini">{r}</span>)}
                </div>
              </div>
            )
          })}
        </div>
        <div className="pl-notice">사진 원본과 카드번호는 서버로 보내지 않아요. 가맹점 업종·금액대, 사진 메타데이터만 기기 안에서 읽고 요약만 남깁니다.</div>
      </div>
      <div className="pl-foot">
        <div className="pl-cta" style={{ background: nSrc ? GREEN : 'rgba(20,24,33,.12)', color: nSrc ? '#fff' : 'rgba(20,24,33,.4)' }} onClick={startScan}>{startLabel}</div>
        <div className="pl-skip" onClick={skipScan}>연결 없이 기본 추천 보기</div>
      </div>
    </div>
  )
}

/* ── 분석 중 ───────────────────────────────────────────────── */
function ScanningScreen({ sources, scanN, cancelScan }: {
  sources: { cards: boolean; photos: boolean }
  scanN: number
  cancelScan: () => void
}) {
  const nCards = sources.cards ? CARDS.length : 0
  const total = scanSteps(sources)
  const inCards = scanN < nCards
  const scanTitle = inCards ? '카드내역을 읽고 있어요' : '사진을 읽고 있어요'
  const scanRows = CARDS.slice(0, 8).map((c, i) => ({
    key: i, mark: c.kind === 'drink' ? '주' : c.kind === 'meal' ? '식' : c.kind === 'cafe' ? '카' : c.kind === 'play' ? '문' : '기',
    name: c.cat, meta: `${c.d}요일 ${c.h}시`, amount: c.amt.toLocaleString('ko-KR') + '원', op: i < scanN ? 1 : 0.25,
  }))
  const scanTiles = PHOTOS.map((p, i) => ({ key: i, bg: p.tone, op: i < scanN - nCards ? 1 : 0.18, label: i < scanN - nCards ? p.place : '' }))
  const pct = Math.round((scanN / Math.max(1, total)) * 100) + '%'
  const status = inCards
    ? `카드 승인내역 ${nCards}건 중 ${scanN}건 확인`
    : scanN < total ? `사진 ${PHOTOS.length}장 중 ${scanN - nCards}장 확인` : '취향 정리 중'

  return (
    <div className="pl-screen">
      <div style={{ padding: '42px 26px 0' }}>
        <div className="pl-h1" style={{ fontSize: 26 }}>{scanTitle}</div>
        <div className="pl-sub" style={{ marginTop: 9 }}>{status}</div>
        <div className="pl-progress"><div className="pl-progress-bar" style={{ width: pct }} /></div>
        <div className="pl-pillbtn" style={{ marginTop: 14, display: 'inline-block' }} onClick={cancelScan}>분석 취소</div>
      </div>
      <div className="pl-scroll" style={{ padding: '20px 26px 30px' }}>
        {inCards ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {scanRows.map((r) => (
              <div key={r.key} className="pl-scanrow" style={{ opacity: r.op }}>
                <div className="pl-scanrow-mark">{r.mark}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '700 13px/1.3 Pretendard,sans-serif', color: '#141821' }}>{r.name}</div>
                  <div style={{ marginTop: 2, font: '400 11px/1.3 Pretendard,sans-serif', color: 'rgba(20,24,33,.45)' }}>{r.meta}</div>
                </div>
                <div style={{ font: '700 12.5px/1 Pretendard,sans-serif', color: '#141821' }}>{r.amount}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7 }}>
            {scanTiles.map((t) => (
              <div key={t.key} style={{ aspectRatio: '1', borderRadius: 12, background: t.bg, opacity: t.op, display: 'flex', alignItems: 'flex-end', padding: 6 }}>
                <span style={{ font: '600 8.5px/1 Pretendard,sans-serif', color: 'rgba(255,255,255,.85)' }}>{t.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── 취향 요약 ─────────────────────────────────────────────── */
function SummaryScreen({ report, taste, setTaste, tags, setTags, intent, setIntent, toStart, rescan, finish, courseCount }: {
  report: ReturnType<typeof analyze>
  taste: Taste
  setTaste: (fn: (t: Taste) => Taste) => void
  tags: string[]
  setTags: (fn: (t: string[]) => string[]) => void
  intent: string | null
  setIntent: (v: string | null) => void
  toStart: () => void
  rescan: () => void
  finish: () => void
  courseCount: number
}) {
  const scanMeta = [`카드 ${report.cardCount}건`, report.total ? `사진 ${report.total}장` : ''].filter(Boolean).join(' · ') + ' 분석'
  const traitCards = Q.filter((x) => !x.multi).map((x) => ({
    key: x.key, name: x.name, evidence: report.evidence[x.key] || '',
    opts: x.opts.map((o) => ({ key: o.v, l: o.l, on: (taste as any)[x.key] === o.v })),
  }))
  const tagChips = Q[5].opts.map((o) => ({ key: o.v, l: o.l, on: tags.indexOf(o.v) > -1 }))
  const intentChips = [
    { v: null as string | null, l: '사진 그대로' }, { v: 'calm', l: '푹 쉬고 싶어' }, { v: 'active', l: '몸 좀 쓰고파' },
    { v: 'new', l: '새로운 거' }, { v: 'food', l: '맛있는 거' },
  ]

  return (
    <div className="pl-screen">
      <div className="pl-scroll" style={{ padding: '36px 22px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ font: '400 11.5px/1 Pretendard,sans-serif', color: 'rgba(20,24,33,.45)' }}>{scanMeta}</span>
          <div className="pl-pillbtn" onClick={toStart}>처음으로</div>
        </div>
        <div className="pl-h1" style={{ marginTop: 9, fontSize: 26 }}>이런 취향이 보여요</div>
        <div className="pl-sub" style={{ marginTop: 9 }}>다르면 눌러서 바꿔주세요. 바꾼 값으로 다시 추천해요.</div>

        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <InfoLine bg="#E4F4EC" tagBg={GREEN} tagFg="#fff" tag="단골" fg="#0C5A42" text={report.repeatLine} />
          <InfoLine bg="#F3F5DC" tagBg="#7C8A1E" tagFg="#fff" tag="인원" fg="#4A5218" text={report.partyLine} />
          <InfoLine bg="#E4F4EC" tagBg="#00845A" tagFg="#fff" tag="예산" fg="#0C5A42" text={report.budgetLine} />
        </div>

        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {traitCards.map((t) => (
            <div key={t.key} className="pl-traitcard">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ font: '600 11.5px/1 Pretendard,sans-serif', color: 'rgba(20,24,33,.42)' }}>{t.name}</span>
                <span style={{ marginLeft: 'auto', font: '600 11px/1 Pretendard,sans-serif', color: '#00845A' }}>{t.evidence}</span>
              </div>
              <div style={{ marginTop: 11, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {t.opts.map((o) => (
                  <Chip key={o.key} label={o.l} on={o.on} onClick={() => setTaste((st) => ({ ...st, [t.key]: o.key }))} />
                ))}
              </div>
            </div>
          ))}
          <div className="pl-traitcard">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ font: '600 11.5px/1 Pretendard,sans-serif', color: 'rgba(20,24,33,.42)' }}>사진에서 자주 나온 것</span>
              <span style={{ marginLeft: 'auto', font: '600 11px/1 Pretendard,sans-serif', color: '#00845A' }}>{report.evidence.tags}</span>
            </div>
            <div style={{ marginTop: 11, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {tagChips.map((c) => (
                <Chip key={c.key} label={c.l} on={c.on} onClick={() => setTags((st) => (st.indexOf(c.key) > -1 ? st.filter((x) => x !== c.key) : st.concat([c.key])))} />
              ))}
            </div>
          </div>
        </div>

        <div className="pl-intentbox">
          <div style={{ font: '800 15.5px/1.35 Pretendard,sans-serif', color: '#141821' }}>이번엔 뭐가 하고 싶어요?</div>
          <div style={{ marginTop: 6, font: '400 12.5px/1.6 Pretendard,sans-serif', color: 'rgba(20,24,33,.5)' }}>사진은 지난 일주일이고, 오늘 기분은 다를 수 있으니까요. 고르면 그쪽 코스를 위로 올려요.</div>
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {intentChips.map((c) => (
              <Chip key={String(c.v)} label={c.l} on={(intent || null) === c.v} onClick={() => setIntent(c.v)} />
            ))}
          </div>
        </div>
        <div className="pl-skip" onClick={rescan}>연결 항목 바꿔서 다시 분석</div>
      </div>
      <div className="pl-foot">
        <div className="pl-cta" onClick={finish}>코스 {courseCount}개 보러 가기</div>
      </div>
    </div>
  )
}

function InfoLine({ bg, tagBg, tagFg, tag, fg, text }: { bg: string; tagBg: string; tagFg: string; tag: string; fg: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '14px 16px', borderRadius: 16, background: bg }}>
      <div style={{ flex: 'none', width: 22, height: 22, borderRadius: 8, background: tagBg, color: tagFg, font: '700 10px/22px Pretendard,sans-serif', textAlign: 'center' }}>{tag}</div>
      <div style={{ flex: 1, font: '600 12.5px/1.6 Pretendard,sans-serif', color: fg }}>{text}</div>
    </div>
  )
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <div className="pl-chip" style={{ background: on ? GREEN : '#fff', borderColor: on ? GREEN : 'rgba(20,24,33,.12)', color: on ? '#fff' : '#2c3444' }} onClick={onClick}>
      {label}
    </div>
  )
}

/* ── 코스 찾기 (조건 칩 + 목록) ────────────────────────────── */
function SearchTab({ cond, setCond, sheet, setSheetKey, built, filtered, taste, tags, restart, openCourse }: {
  cond: typeof DEFAULT_COND
  setCond: (fn: (c: typeof DEFAULT_COND) => typeof DEFAULT_COND) => void
  sheet: (typeof COND)[number] | null
  setSheetKey: (k: string | null) => void
  built: BuiltCourse[]
  filtered: BuiltCourse[]
  taste: Taste
  tags: string[]
  restart: () => void
  openCourse: (id: string) => void
}) {
  const profileLine = '사진에서 읽은 취향 · ' + [labelOf(Q[2].opts, taste.hour), labelOf(Q[3].opts, taste.spend)].filter(Boolean).join(' · ') + (tags.length ? ' · ' + tags.join('·') : '')
  const resultHead = filtered.length ? `조건에 맞는 코스 ${filtered.length}개` : '조건에 맞는 코스가 없어요'
  const condDirty = COND.some((c) => (cond as any)[c.key] !== (DEFAULT_COND as any)[c.key])
  const emptyHint = cond.budget && built.filter((c) => matchCond(c, { ...cond, budget: 0 })).length
    ? '예산을 조금 올리면 볼 수 있는 코스가 있어요'
    : cond.hours && built.filter((c) => matchCond(c, { ...cond, hours: 0 })).length
      ? '시간을 조금 늘리면 볼 수 있는 코스가 있어요'
      : '지역이나 시간 조건을 넓혀보세요'

  return (
    <div className="pl-screen">
      <div style={{ flex: 'none', padding: '42px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ font: '400 11.5px/1 Pretendard,sans-serif', color: 'rgba(20,24,33,.45)' }}>{profileLine}</div>
            <div className="pl-h1" style={{ marginTop: 8, fontSize: 25 }}>{resultHead}</div>
          </div>
          <div className="pl-pillbtn" style={{ marginTop: 16 }} onClick={restart}>다시 분석</div>
        </div>
        <div className="pl-chipbar">
          {COND.map((c) => {
            const on = (cond as any)[c.key] !== (DEFAULT_COND as any)[c.key]
            return (
              <div key={c.key} className="pl-condchip" style={{ background: on ? '#141821' : '#fff', borderColor: on ? '#141821' : 'rgba(20,24,33,.1)', color: on ? '#fff' : 'rgba(20,24,33,.7)' }} onClick={() => setSheetKey(c.key)}>
                <span style={{ opacity: 0.5, fontWeight: 500 }}>{c.name}</span>{labelOf(c.opts, (cond as any)[c.key])}<span style={{ opacity: 0.55 }}>▾</span>
              </div>
            )
          })}
          {condDirty && <div className="pl-condchip pl-condchip-reset" onClick={() => setCond(() => ({ ...DEFAULT_COND }))}>초기화</div>}
        </div>
      </div>
      <div className="pl-scroll" style={{ padding: '16px 20px 96px', borderTop: '1px solid rgba(20,24,33,.06)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((s) => (
            <div key={s.id} className="pl-coursecard" onClick={() => openCourse(s.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                <span className="pl-matchtag" style={{ background: s.tintBg, color: s.tintFg }}>{s.matchLabel}</span>
                <span style={{ font: '500 11.5px/1 Pretendard,sans-serif', color: 'rgba(20,24,33,.45)' }}>{s.area} · {s.span}</span>
              </div>
              <div className="pl-coursetitle">{s.title}</div>
              <div style={{ marginTop: 6, font: '400 13px/1.6 Pretendard,sans-serif', color: 'rgba(20,24,33,.55)' }}>{s.why}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 13 }}>
                {s.kindChips.map((k) => <span key={k} className="pl-kindchip">{k}</span>)}
                <span style={{ marginLeft: 'auto', font: '700 12.5px/1 Pretendard,sans-serif', color: '#141821', alignSelf: 'center' }}>{s.costLabel}</span>
              </div>
              <div className="pl-coursefoot">
                <span>{s.moveLine}</span>
                <span style={{ color: 'rgba(20,24,33,.42)' }}>{s.bookLine}</span>
              </div>
            </div>
          ))}
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: '40px 22px', textAlign: 'center' }}>
            <div style={{ font: '700 15.5px/1.5 Pretendard,sans-serif', color: '#141821' }}>이 조건에 맞는 코스가 없어요</div>
            <div style={{ marginTop: 7, font: '400 13px/1.6 Pretendard,sans-serif', color: 'rgba(20,24,33,.5)' }}>{emptyHint}</div>
            <div className="pl-cta" style={{ display: 'inline-block', marginTop: 16, padding: '13px 20px', borderRadius: 99 }} onClick={() => setCond(() => ({ ...DEFAULT_COND }))}>조건 초기화</div>
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

/* ── 저장한 코스 ───────────────────────────────────────────── */
function SavedTab({ savedBuilt, people, openCourse, remove, goSearch }: {
  savedBuilt: BuiltCourse[]
  people: number
  openCourse: (id: string) => void
  remove: (id: string) => void
  goSearch: () => void
}) {
  const countLine = savedBuilt.length ? `${savedBuilt.length}개 · 인원 ${people}명 기준 금액` : '아직 비어 있어요'
  return (
    <div className="pl-screen">
      <div style={{ flex: 'none', padding: '38px 20px 16px' }}>
        <div style={{ font: '400 11.5px/1 Pretendard,sans-serif', color: 'rgba(20,24,33,.45)' }}>{countLine}</div>
        <div className="pl-h1" style={{ marginTop: 8, fontSize: 25 }}>저장한 코스</div>
      </div>
      <div className="pl-scroll" style={{ padding: '0 20px 96px' }}>
        {savedBuilt.length === 0 && (
          <div style={{ marginTop: 60, textAlign: 'center', padding: '0 24px' }}>
            <div className="pl-emptyicon">♡</div>
            <div style={{ font: '800 18px/1.35 Pretendard,sans-serif', color: '#141821' }}>아직 저장한 코스가 없어요</div>
            <div style={{ marginTop: 8, font: '400 13px/1.7 Pretendard,sans-serif', color: 'rgba(20,24,33,.5)' }}>마음에 드는 코스를 열어서<br />'이 코스로 저장'을 눌러두면 여기 모여요</div>
            <div className="pl-cta" style={{ display: 'inline-block', marginTop: 20, padding: '14px 22px', borderRadius: 99 }} onClick={goSearch}>코스 찾아보기</div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {savedBuilt.map((s) => (
            <div key={s.id} className="pl-savedcard">
              <div style={{ cursor: 'pointer', padding: '18px 18px 14px' }} onClick={() => openCourse(s.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                  <span className="pl-matchtag" style={{ background: s.tintBg, color: s.tintFg }}>{s.matchLabel}</span>
                  <span style={{ font: '500 11.5px/1 Pretendard,sans-serif', color: 'rgba(20,24,33,.45)' }}>{s.area} · {s.moveLine}</span>
                  <span style={{ marginLeft: 'auto', font: '700 12.5px/1 Pretendard,sans-serif', color: '#141821' }}>{s.costLabel}</span>
                </div>
                <div className="pl-coursetitle">{s.title}</div>
                <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {s.items.slice(0, 3).map((it, i) => (
                    <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'baseline' }}>
                      <span style={{ flex: 'none', width: 38, font: '700 11.5px/1.5 Pretendard,sans-serif', color: 'rgba(20,24,33,.4)' }}>{it.time}</span>
                      <span style={{ font: '500 12.5px/1.5 Pretendard,sans-serif', color: 'rgba(20,24,33,.62)' }}>{it.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', borderTop: '1px solid rgba(20,24,33,.06)' }}>
                <div style={{ flex: 1, padding: 14, textAlign: 'center', font: '600 13px/1 Pretendard,sans-serif', color: 'rgba(20,24,33,.7)', cursor: 'pointer' }} onClick={() => openCourse(s.id)}>전체 일정</div>
                <div style={{ width: 1, background: 'rgba(20,24,33,.06)' }} />
                <div style={{ flex: 'none', padding: '14px 20px', textAlign: 'center', font: '600 13px/1 Pretendard,sans-serif', color: '#c3503f', cursor: 'pointer' }} onClick={() => remove(s.id)}>저장 취소</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── 하단 탭바 ─────────────────────────────────────────────── */
function TabBar({ tab, savedCount, setTab, toStart }: { tab: Tab; savedCount: number; setTab: (t: Tab) => void; toStart: () => void }) {
  const tabs: { key: 'home' | Tab; l: string; icon: string; badge: string }[] = [
    { key: 'home', l: '처음으로', icon: '⌂', badge: '' },
    { key: 'search', l: '코스 찾기', icon: '◎', badge: '' },
    { key: 'saved', l: '저장', icon: '♡', badge: savedCount ? ' ' + savedCount : '' },
  ]
  return (
    <div className="pl-tabbar">
      {tabs.map((t) => {
        const on = tab === t.key
        return (
          <div key={t.key} className="pl-tab" style={{ background: on ? '#E4F4EC' : 'transparent' }}
            onClick={() => (t.key === 'home' ? toStart() : setTab(t.key))}>
            <div style={{ font: '400 17px/1 Pretendard,sans-serif', color: on ? '#00845A' : 'rgba(20,24,33,.42)' }}>{t.icon}</div>
            <div style={{ marginTop: 5, font: '700 11px/1 Pretendard,sans-serif', color: on ? '#00845A' : 'rgba(20,24,33,.42)' }}>{t.l}<span style={{ fontWeight: 500, opacity: 0.6 }}>{t.badge}</span></div>
          </div>
        )
      })}
    </div>
  )
}

/* ── 코스 상세 모달 (타임라인 + 이동 동선) ─────────────────── */
function CourseModal({ course, isSaved, booked, toggleBook, save, close }: {
  course: BuiltCourse
  isSaved: boolean
  booked: string[]
  toggleBook: (key: string) => void
  save: () => void
  close: () => void
}) {
  return (
    <div className="pl-modal-wrap">
      <div className="pl-sheet-backdrop" onClick={close} />
      <div className="pl-modal">
        <div style={{ flex: 'none', padding: '12px 22px 16px' }}>
          <div className="pl-sheet-handle" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span className="pl-matchtag" style={{ background: course.tintBg, color: course.tintFg }}>{course.matchLabel}</span>
            <span style={{ flex: 1, minWidth: 0, font: '500 11.5px/1 Pretendard,sans-serif', color: 'rgba(20,24,33,.45)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{course.area} · {course.span}</span>
            <div className="pl-closebtn" onClick={close}>✕</div>
          </div>
          <div className="pl-h1" style={{ fontSize: 24 }}>{course.title}</div>
          <div style={{ marginTop: 8, font: '400 13px/1.65 Pretendard,sans-serif', color: 'rgba(20,24,33,.58)' }}>{course.why}</div>
          <div style={{ marginTop: 10, display: 'inline-block', padding: '6px 11px', borderRadius: 99, background: '#E4F4EC', font: '600 11.5px/1 Pretendard,sans-serif', color: '#00734F' }}>{course.moveLine} · 총 {course.dur}</div>
        </div>
        <div className="pl-scroll" style={{ padding: '6px 22px 20px', borderTop: '1px solid rgba(20,24,33,.06)' }}>
          <RouteMap course={course} />
          <div style={{ paddingTop: 18 }}>
            {course.items.map((it, i) => (
              <div key={i}>
                {it.hasMove && (
                  <div style={{ display: 'flex', gap: 13, alignItems: 'center', margin: '-14px 0 12px' }}>
                    <div style={{ flex: 'none', width: 44 }} />
                    <div style={{ flex: 'none', width: 11, display: 'flex', justifyContent: 'center' }}>
                      <div style={{ width: 1, height: 34, background: 'repeating-linear-gradient(to bottom,rgba(20,24,33,.22) 0 4px,transparent 4px 8px)' }} />
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ padding: '5px 10px', borderRadius: 99, background: it.moveTint, color: '#fff', font: '700 11px/1 Pretendard,sans-serif' }}>{it.moveLabel}</span>
                      <span style={{ font: '500 11.5px/1 Pretendard,sans-serif', color: 'rgba(20,24,33,.45)' }}>{it.moveDetail}</span>
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 13 }}>
                  <div style={{ flex: 'none', width: 44, paddingTop: 2, font: '700 12.5px/1.5 Pretendard,sans-serif', color: 'rgba(20,24,33,.42)' }}>{it.time}</div>
                  <div style={{ flex: 'none', width: 11, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 11, height: 11, borderRadius: 99, marginTop: 5, border: `2.5px solid ${course.tint}`, background: '#fff' }} />
                    <div style={{ flex: 1, width: 1, background: 'rgba(20,24,33,.12)' }} />
                  </div>
                  <div style={{ flex: 1, paddingBottom: 22 }}>
                    <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                      <div className="pl-thumb" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: '700 15.5px/1.4 Pretendard,sans-serif', letterSpacing: '-.02em', color: '#141821' }}>{it.name}</div>
                        <div style={{ marginTop: 4, font: '400 12.5px/1.6 Pretendard,sans-serif', color: 'rgba(20,24,33,.5)' }}>{it.note}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
                          <span className="pl-kindchip">{it.kind}</span>
                          <span className="pl-kindchip">{it.dur}</span>
                          <span className="pl-kindchip">{it.cost}</span>
                        </div>
                      </div>
                    </div>
                    {it.bookable && (
                      <BookButton item={it} isBooked={booked.indexOf(it.bookKey) > -1} onClick={() => toggleBook(it.bookKey)} />
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div style={{ padding: '15px 16px', borderRadius: 16, background: '#E4F4EC', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, font: '600 12.5px/1.5 Pretendard,sans-serif', color: 'rgba(20,24,33,.62)' }}>{course.totalNote}</div>
              <div style={{ font: '800 19px/1 Pretendard,sans-serif', color: '#141821' }}>{course.costLabel}</div>
            </div>
          </div>
        </div>
        <div style={{ flex: 'none', padding: '14px 22px 30px', display: 'flex', alignItems: 'stretch', gap: 9, borderTop: '1px solid rgba(20,24,33,.06)' }}>
          <div className="pl-cta" style={{ flex: 1, margin: 0, boxSizing: 'border-box', border: '1px solid transparent', background: isSaved ? '#D8E64A' : GREEN, color: isSaved ? '#37401A' : '#fff' }} onClick={save}>
            {isSaved ? '저장함 · 저장 탭에서 보기' : '이 코스로 저장'}
          </div>
          <div style={{ flex: 'none', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 18px', borderRadius: 17, border: '1px solid rgba(20,24,33,.12)', font: '600 15px/1 Pretendard,sans-serif', color: 'rgba(20,24,33,.65)', cursor: 'pointer' }}>공유</div>
        </div>
      </div>
    </div>
  )
}

function BookButton({ item, isBooked, onClick }: { item: BuiltCourse['items'][number]; isBooked: boolean; onClick: () => void }) {
  const providerDot = item.provider === '캐치테이블 예약' ? '#E2452F' : '#03C75A'
  return (
    <div className="pl-bookbtn" style={{
      background: isBooked ? '#E4F4EC' : '#fff',
      borderColor: isBooked ? GREEN : 'rgba(20,24,33,.14)',
      color: isBooked ? '#00734F' : '#141821',
    }} onClick={onClick}>
      <span className="pl-bookdot" style={{ background: providerDot }} />
      {isBooked ? '예약 요청됨' : item.provider}
    </div>
  )
}

function RouteMap({ course }: { course: BuiltCourse }) {
  const markers = useMemo(
    // 실제 장소(pid)가 연결된 곳만 핀 표시
    () => course.markers.flatMap((mk, i) => {
      const g = placeGeo(course.items[i]?.pid)
      return g ? [{ no: mk.no, name: mk.name, time: mk.time, lat: g[0], lng: g[1] }] : []
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [course.id, course.markers.map((m) => m.name + m.time).join('|')],
  )

  return (
    <div className="pl-mapwrap">
      <NaverMap
        markers={markers} color={GREEN}
        // 핀이 하나라도 빠지면 구간 순서가 어긋나므로 직선으로 대체
        paths={markers.length === course.items.length ? WALK_PATHS[course.id] : undefined}
      />
      <div className="pl-mapbadges">
        <span className="pl-mapbadge">{course.area}</span>
        <span className="pl-mapbadge" style={{ color: '#00845A' }}>{course.moveLine}</span>
      </div>
    </div>
  )
}
