import {
  CARDS, COND, LEGS, PHOTOS, Q,
  durLabel, hhmm, label, moveTint, won,
} from './data'
import type { Cond, Course, TasteKey } from './data'

export interface Taste {
  mood?: string
  crowd?: string
  hour?: string
  spend?: string
  pace?: string
}

export interface Report {
  repeatSpots: string[]
  party: number
  perOuting: number
  budgetBand: number
  cardTotal: number
  cardCount: number
  taste: Required<Taste>
  tags: string[]
  evidence: Record<string, string>
  repeatLine: string
  partyLine: string
  budgetLine: string
  total: number
  days: number
}

export function matchCond(c: { area: string; minutes: number; perPerson: number }, cond: Cond) {
  if (cond.area !== 'any' && c.area !== cond.area) return false
  if (cond.hours && c.minutes > cond.hours * 60) return false
  if (cond.budget && c.perPerson > cond.budget) return false
  return true
}

export function scanSteps(sources: { cards: boolean; photos: boolean }, photoCount = PHOTOS.length) {
  return (sources.cards ? CARDS.length : 0) + (sources.photos ? photoCount : 0)
}

function count<T extends string>(arr: T[]): Record<string, number> {
  return arr.reduce((m, v) => ((m[v] = (m[v] || 0) + 1), m), {} as Record<string, number>)
}
function top(obj: Record<string, number>) {
  return Object.keys(obj).sort((a, b) => obj[b] - obj[a])[0]
}

export function analyze(sources: { cards: boolean; photos: boolean }): Report {
  const usePhotos = sources.photos
  const ph = usePhotos ? PHOTOS : []
  if (!ph.length) return analyzeCardsOnly()

  const bucket = (h: number) => (h < 11 ? 'morning' : h < 16 ? 'noon' : h < 19 ? 'sunset' : 'night')
  const hours = count(ph.map((p) => bucket(p.h)))
  const places = count(ph.map((p) => p.place))
  const tags = count(ph.map((p) => p.tag))
  const hour = top(hours)
  const outdoor = ph.filter((p) => ['공원', '강변', '거리'].indexOf(p.place) > -1).length
  const cafe = places['카페'] || 0, bar = places['바'] || 0, meal = places['식당'] || 0, show = places['전시장'] || 0

  const useCards = sources.cards
  const cd = useCards ? CARDS : []
  const sum = (k: string) => cd.filter((c) => c.kind === k).reduce((s, c) => s + c.amt, 0)
  const cardSpend: Record<string, number> = { cafe: sum('cafe'), drink: sum('drink'), meal: sum('meal'), play: sum('play') }
  const cardTotal = cd.reduce((s, c) => s + c.amt, 0)
  const outings = new Set(cd.map((c) => c.d)).size || 1
  const perOuting = cardTotal ? Math.round(cardTotal / outings / 1000) * 1000 : 0
  const spendMap: Record<string, { n: number; l: string }> = {
    cafe: { n: cafe, l: '카페' }, drink: { n: bar, l: '바' }, meal: { n: meal, l: '식당' }, play: { n: show, l: '전시장' },
  }
  const cardTop = Object.keys(cardSpend).sort((a, b) => cardSpend[b] - cardSpend[a])[0]
  const spend = useCards && cardTotal ? cardTop : Object.keys(spendMap).sort((a, b) => spendMap[b].n - spendMap[a].n)[0]
  const spendLabel: Record<string, string> = { cafe: '카페·디저트', drink: '술', meal: '식사', play: '문화·체험' }

  const moodMap: Record<string, { n: number; why: string }> = {
    new: { n: show, why: '전시장 ' + show + '곳' },
    calm: { n: (places['공원'] || 0) + (places['강변'] || 0), why: '공원·강변 ' + ((places['공원'] || 0) + (places['강변'] || 0)) + '장' },
    food: { n: meal + bar, why: '식당·바 ' + (meal + bar) + '장' },
    active: { n: places['거리'] || 0, why: '거리 사진 ' + (places['거리'] || 0) + '장' },
  }
  const mood = Object.keys(moodMap).sort((a, b) => moodMap[b].n - moodMap[a].n)[0]
  const pace = outdoor >= ph.length * 0.4 ? 'walk' : 'sit'
  const busyCount = bar + meal
  const busyRatio = Math.round((busyCount / ph.length) * 100)
  const crowd = busyRatio >= 45 ? 'busy' : busyRatio <= 25 ? 'quiet' : 'mid'
  const topTags = Object.keys(tags).sort((a, b) => tags[b] - tags[a]).slice(0, 3)
  const spots = count(ph.map((p) => p.spot))
  const repeatSpots = Object.keys(spots).filter((k) => spots[k] >= 2).sort((a, b) => spots[b] - spots[a])
  const party = Math.round(ph.reduce((s, p) => s + p.n, 0) / ph.length)
  if (repeatSpots.length >= 2 && topTags.indexOf('로컬') < 0) topTags.push('로컬')
  const budgetBand = perOuting >= 70000 ? 80000 : perOuting >= 45000 ? 50000 : perOuting >= 30000 ? 35000 : 20000

  return {
    repeatSpots, party, perOuting, budgetBand, cardTotal, cardCount: cd.length,
    taste: { mood, crowd, hour, spend, pace } as Required<Taste>, tags: topTags,
    evidence: {
      hour: label(Q[2].opts, hour) + ' ' + ph.filter((p) => bucket(p.h) === hour).length + '/' + ph.length + '장',
      spend: useCards && cardTotal
        ? '카드 ' + spendLabel[spend] + ' ' + Math.round((cardSpend[spend] / cardTotal) * 100) + '% · ' + Math.round(cardSpend[spend] / 10000) + '만원'
        : spendMap[spend].l + ' ' + spendMap[spend].n + '회로 가장 많음',
      mood: moodMap[mood].why,
      pace: '야외 ' + outdoor + '/' + ph.length + '장',
      crowd: '붐비는 장소(식당·바) ' + busyRatio + '%',
      tags: topTags.map((t) => t + ' ' + (tags[t] || '재방문')).join(' · '),
    },
    repeatLine: repeatSpots.length ? `'${repeatSpots[0]}' ${spots[repeatSpots[0]]}번 재방문 · 단골 성향` : '같은 곳을 다시 간 적은 없어요',
    partyLine: '사진 속 평균 ' + party + '명 · 인원 조건을 ' + party + '명으로 맞췄어요',
    budgetLine: cardTotal
      ? '한 번 나갈 때 평균 ' + perOuting.toLocaleString('ko-KR') + '원 · 예산 조건을 ' + Math.round((budgetBand / 10000) * 10) / 10 + '만원 이하로 맞췄어요'
      : '카드내역을 연결하면 예산까지 맞춰드려요',
    total: ph.length, days: new Set(ph.map((p) => p.d)).size,
  }
}

export function analyzeCardsOnly(): Report {
  const cd = CARDS
  const sum = (k: string) => cd.filter((c) => c.kind === k).reduce((s, c) => s + c.amt, 0)
  const spendSum: Record<string, number> = { cafe: sum('cafe'), drink: sum('drink'), meal: sum('meal'), play: sum('play') }
  const total = cd.reduce((s, c) => s + c.amt, 0)
  const spend = Object.keys(spendSum).sort((a, b) => spendSum[b] - spendSum[a])[0]
  const labelMap: Record<string, string> = { cafe: '카페·디저트', drink: '술', meal: '식사', play: '문화·체험' }
  const night = cd.filter((c) => c.h >= 19).length
  const hour = night >= cd.length / 2 ? 'night' : 'sunset'
  const outings = new Set(cd.map((c) => c.d)).size || 1
  const perOuting = Math.round(total / outings / 1000) * 1000
  const budgetBand = perOuting >= 70000 ? 80000 : perOuting >= 45000 ? 50000 : perOuting >= 30000 ? 35000 : 20000
  const tags = spend === 'play' ? ['전시'] : spend === 'drink' ? ['야경'] : ['로컬']
  return {
    taste: { mood: spend === 'play' ? 'new' : 'food', crowd: 'mid', hour, spend, pace: 'sit' } as Required<Taste>, tags,
    evidence: {
      hour: label(Q[2].opts, hour) + ' · 결제 ' + night + '/' + cd.length + '건이 저녁 이후',
      spend: '카드 ' + labelMap[spend] + ' ' + Math.round((spendSum[spend] / total) * 100) + '%',
      mood: '가맹점 업종 기준 추정',
      pace: '사진 미연결 · 기본값',
      crowd: '사진 미연결 · 기본값',
      tags: '카드 업종에서 추정',
    },
    repeatSpots: [], party: 2, perOuting, budgetBand, cardTotal: total, cardCount: cd.length,
    repeatLine: '사진첩을 연결하면 단골 성향까지 읽어요',
    partyLine: '사진첩을 연결하면 동행 인원까지 맞춰드려요',
    budgetLine: '한 번 나갈 때 평균 ' + perOuting.toLocaleString('ko-KR') + '원 · 예산 조건을 ' + Math.round((budgetBand / 10000) * 10) / 10 + '만원 이하로 맞췄어요',
    total: 0, days: outings,
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
  answered.forEach((k) => { if (tw[k] === c.traits[k]) raw += 20 })
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
