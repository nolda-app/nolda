import {
  COND, LEGS, PHOTOS, Q,
  durLabel, hhmm, label, moveTint, won,
} from './data'
import type { Cond, Course, TasteKey } from './data'
import type { YoutubeTaste } from './api'

export interface Taste {
  mood?: string
  crowd?: string
  hour?: string
  spend?: string
  pace?: string
  /** 일정 밀도 tight | relaxed — 코스 성격이 아니라 코스를 짜는 방식이라 점수 계산엔 안 씀 */
  plan?: string
  /** 함께 가는 사람 solo | couple | friends | family | coworkers — 점수 계산엔 안 쓰고 AI 코스 요청에만 */
  companion?: string
}

export interface Sources { youtube: boolean; photos: boolean }

export interface Report {
  repeatSpots: string[]
  party: number
  budgetBand: number
  ytLikes: number
  ytSubs: number
  taste: Omit<Required<Taste>, 'plan' | 'companion'>
  tags: string[]
  evidence: Record<string, string>
  /** 요약 화면 짧은 칩 (단골·인원) — 사진첩이 없으면 비어 있음 */
  highlights: string[]
  total: number
  days: number
}

export function matchCond(c: { area: string; minutes: number; perPerson: number }, cond: Cond) {
  if (cond.area !== 'any' && c.area !== cond.area) return false
  if (cond.hours && c.minutes > cond.hours * 60) return false
  if (cond.budget && c.perPerson > cond.budget) return false
  return true
}

/** 분석 중 화면에 한 줄씩 켜지는 유튜브 기록 (좋아요 영상 6 + 구독 채널 4) */
export function ytScanRows(yt: YoutubeTaste | null) {
  if (!yt) return []
  return [
    ...yt.titles.slice(0, 6).map((t) => ({ mark: '좋', name: t, meta: '좋아요한 영상' })),
    ...yt.sub_channels.slice(0, 4).map((c) => ({ mark: '구', name: c, meta: '구독 채널' })),
  ]
}

export function scanSteps(sources: Sources, yt: YoutubeTaste | null) {
  return (sources.youtube ? ytScanRows(yt).length : 0) + (sources.photos ? PHOTOS.length : 0)
}

const PACE_LEVELS = ['low', 'mid', 'high', 'very']

function count<T extends string>(arr: T[]): Record<string, number> {
  return arr.reduce((m, v) => ((m[v] = (m[v] || 0) + 1), m), {} as Record<string, number>)
}
function top(obj: Record<string, number>) {
  return Object.keys(obj).sort((a, b) => obj[b] - obj[a])[0]
}

// 카드내역이 없어져 예산은 추정하지 않음 — 결과 화면 조건에서 직접 고름
const NO_BUDGET = { budgetBand: 0 }

export function analyze(sources: Sources, yt: YoutubeTaste | null): Report {
  const y = sources.youtube ? yt : null
  const ph = sources.photos ? PHOTOS : []
  if (!ph.length) return analyzeYoutubeOnly(y)

  const h = y?.hints
  const bucket = (hr: number) => (hr < 11 ? 'morning' : hr < 16 ? 'noon' : hr < 19 ? 'sunset' : 'night')
  const hours = count(ph.map((p) => bucket(p.h)))
  const places = count(ph.map((p) => p.place))
  const tags = count(ph.map((p) => p.tag))
  const hour = top(hours)
  const outdoor = ph.filter((p) => ['공원', '강변', '거리'].indexOf(p.place) > -1).length
  const cafe = places['카페'] || 0, bar = places['바'] || 0, meal = places['식당'] || 0, show = places['전시장'] || 0

  const spendMap: Record<string, { n: number; l: string }> = {
    cafe: { n: cafe, l: '카페' }, drink: { n: bar, l: '바' }, meal: { n: meal, l: '식당' }, play: { n: show, l: '전시장' },
  }
  const moodMap: Record<string, { n: number; why: string }> = {
    new: { n: show, why: '전시장 ' + show + '곳' },
    calm: { n: (places['공원'] || 0) + (places['강변'] || 0), why: '공원·강변 ' + ((places['공원'] || 0) + (places['강변'] || 0)) + '장' },
    food: { n: meal + bar, why: '식당·바 ' + (meal + bar) + '장' },
    active: { n: places['거리'] || 0, why: '거리 사진 ' + (places['거리'] || 0) + '장' },
  }
  // 유튜브 힌트가 있으면 그쪽 우선, 없으면 사진으로
  const spend = h?.spend || Object.keys(spendMap).sort((a, b) => spendMap[b].n - spendMap[a].n)[0]
  const mood = h?.mood || Object.keys(moodMap).sort((a, b) => moodMap[b].n - moodMap[a].n)[0]
  const outRatio = outdoor / ph.length
  const pace = h?.pace || (outRatio >= 0.6 ? 'very' : outRatio >= 0.4 ? 'high' : outRatio >= 0.2 ? 'mid' : 'low')
  const busyCount = bar + meal
  const busyRatio = Math.round((busyCount / ph.length) * 100)
  const crowd = busyRatio >= 45 ? 'busy' : busyRatio <= 25 ? 'quiet' : 'mid'
  const photoTags = Object.keys(tags).sort((a, b) => tags[b] - tags[a]).slice(0, 3)
  const spots = count(ph.map((p) => p.spot))
  const repeatSpots = Object.keys(spots).filter((k) => spots[k] >= 2).sort((a, b) => spots[b] - spots[a])
  const party = Math.round(ph.reduce((s, p) => s + p.n, 0) / ph.length)
  if (repeatSpots.length >= 2 && photoTags.indexOf('로컬') < 0) photoTags.push('로컬')
  const topTags = [...new Set([...(h?.tags || []), ...photoTags])].slice(0, 3)

  return {
    repeatSpots, party, ...NO_BUDGET, ytLikes: y?.likes ?? 0, ytSubs: y?.subs ?? 0,
    taste: { mood, crowd, hour, spend, pace }, tags: topTags,
    evidence: {
      hour: label(Q[2].opts, hour) + ' ' + ph.filter((p) => bucket(p.h) === hour).length + '/' + ph.length + '장',
      spend: h?.spend ? h.evidence.spend : spendMap[spend].l + ' ' + spendMap[spend].n + '회로 가장 많음',
      mood: h?.mood ? h.evidence.mood : moodMap[mood].why,
      pace: h?.pace ? h.evidence.pace : '야외 ' + outdoor + '/' + ph.length + '장',
      crowd: '붐비는 장소(식당·바) ' + busyRatio + '%',
      tags: [h?.evidence.tags, photoTags.map((t) => t + ' ' + (tags[t] || '재방문')).join(' · ')].filter(Boolean).join(' / '),
    },
    highlights: [...(repeatSpots.length ? [`${repeatSpots[0]} 단골`] : []), `평균 ${party}명과 함께`],
    total: ph.length, days: new Set(ph.map((p) => p.d)).size,
  }
}

export function analyzeYoutubeOnly(y: YoutubeTaste | null): Report {
  const h = y?.hints
  const fallback = '유튜브 기록이 적어 기본값'
  return {
    taste: { mood: h?.mood || 'food', crowd: 'mid', hour: 'noon', spend: h?.spend || 'cafe', pace: h?.pace || 'mid' },
    tags: h?.tags.length ? h.tags.slice(0, 3) : ['로컬'],
    evidence: {
      mood: h?.evidence.mood || fallback,
      spend: h?.evidence.spend || fallback,
      pace: h?.evidence.pace || fallback,
      hour: '사진 미연결 · 기본값',
      crowd: '사진 미연결 · 기본값',
      tags: h?.evidence.tags || fallback,
    },
    repeatSpots: [], party: 2, ...NO_BUDGET, ytLikes: y?.likes ?? 0, ytSubs: y?.subs ?? 0,
    highlights: [],
    total: 0, days: 0,
  }
}

export interface BuiltItem {
  time: string; name: string; kind: string; note: string; pid?: string
  bookable: boolean; provider: string
  bookKey: string
  dur: string; mins: number; cost: string
  hasMove: boolean; moveLabel: string; moveDetail: string; moveTint: string
}

export interface BuiltCourse extends Omit<Course, 'items'> {
  items: BuiltItem[]
  score: number
  kindChips: string[]
  minutes: number
  perPerson: number
  moveTotal: number
  markers: { key: number; no: number; name: string; time: string }[]
  bookLine: string
  moveLine: string
  span: string
  dur: string
  costLabel: string
  totalNote: string
  matchLabel: string
  tint: string
  tintBg: string
  tintFg: string
}

export function build(
  c: Course,
  ctx: { taste: Taste; tags: string[]; intent: string | null; people: number; booked: string[] },
): BuiltCourse {
  const t0 = c.start * 60
  const legs = c.legs || LEGS[c.id] || []
  let t = t0
  let moveTotal = 0
  const items: BuiltItem[] = c.items.map((it, i) => {
    const leg = i ? legs[i - 1] || { m: '도보', t: 10, d: '' } : null
    if (leg) { t += leg.t; moveTotal += leg.t }
    const prov = ['식사', '한잔'].indexOf(it.k) > -1 ? '캐치테이블 예약' : ['체험', '문화'].indexOf(it.k) > -1 ? '네이버 예약' : null
    const bookKey = c.id + '-' + i
    const row: BuiltItem = {
      time: hhmm(t), name: it.n, kind: it.k, note: it.note, pid: it.pid,
      bookable: !!prov, provider: prov || '', bookKey,
      dur: durLabel(it.d), mins: it.d, cost: it.c ? won(it.c) : '무료',
      hasMove: !!leg,
      moveLabel: leg ? leg.m + ' ' + leg.t + '분' : '',
      moveDetail: leg ? leg.d : '',
      moveTint: leg ? moveTint(leg.m) : 'transparent',
    }
    t += it.d
    return row
  })
  const total = c.items.reduce((s, i) => s + i.c, 0)
  const people = ctx.people
  const tw = ctx.taste
  const keys: TasteKey[] = ['mood', 'crowd', 'hour', 'spend', 'pace']
  const answered = keys.filter((k) => tw[k])
  let raw = 0
  answered.forEach((k) => {
    if (tw[k] === c.traits[k]) raw += 20
    // 활동성은 단계라 한 칸 차이면 절반 점수
    else if (k === 'pace' && Math.abs(PACE_LEVELS.indexOf(tw[k]!) - PACE_LEVELS.indexOf(c.traits[k])) === 1) raw += 10
  })
  const hit = c.tags.filter((t2) => ctx.tags.indexOf(t2) > -1)
  raw += hit.length * 12
  if (ctx.intent && c.traits.mood === ctx.intent) raw += 24
  const max = answered.length * 20 + ctx.tags.length * 12 + (ctx.intent ? 24 : 0)
  const score = max ? Math.round(38 + (raw / max) * 60) : 60
  const strong = score >= 80

  return {
    ...c, items, score,
    kindChips: Array.from(new Set(c.items.map((i) => i.k))),
    minutes: t - t0,
    perPerson: total,
    moveTotal,
    markers: items.map((it, i) => ({ key: i, no: i + 1, name: it.name, time: it.time })),
    bookLine: items.filter((x) => x.bookable).length
      ? '예약 연동 ' + items.filter((x) => x.bookable).length + '곳 · 캐치테이블/네이버'
      : '예약 없이 바로 갈 수 있어요',
    moveLine: '이동 ' + durLabel(moveTotal) + ' · ' + (legs.every((l) => l.m === '도보') ? '전부 도보' : legs.map((l) => l.m).join('→')),
    span: hhmm(t0) + '–' + hhmm(t),
    dur: durLabel(t - t0),
    costLabel: people > 1 ? '총 ' + won(total * people) : '1인 ' + won(total),
    totalNote: people > 1 ? people + '명 기준 · 1인 ' + won(total) + ' · 이동 시간 포함' : '1인 기준 · 이동 시간 포함',
    matchLabel: '취향 ' + score + '%',
    tint: c.tint,
    tintBg: strong ? '#E4F4EC' : 'rgba(20,24,33,.05)',
    tintFg: strong ? '#00734F' : 'rgba(20,24,33,.55)',
  }
}

export { COND, Q }
