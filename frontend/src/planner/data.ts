export type CondKey = 'area' | 'hours' | 'people' | 'budget'
export type TasteKey = 'mood' | 'crowd' | 'hour' | 'spend' | 'pace'

export interface Cond {
  area: string
  hours: number
  people: number
  budget: number
}

export const DEFAULT_COND: Cond = { area: 'any', hours: 0, people: 2, budget: 0 }

export const COND: {
  key: CondKey
  name: string
  title: string
  hint: string
  opts: { v: string | number; l: string }[]
}[] = [
  {
    key: 'area', name: '지역', title: '어디에서 만나요?', hint: '고른 동네의 코스만 보여드려요',
    opts: [{ v: 'any', l: '어디든' }, { v: '성수', l: '성수' }, { v: '연남', l: '연남' }, { v: '을지로', l: '을지로' }, { v: '한남', l: '한남' }],
  },
  {
    key: 'hours', name: '시간', title: '얼마나 쓸 수 있어요?', hint: '이동 시간까지 포함해서 걸러요',
    opts: [{ v: 0, l: '상관없음' }, { v: 2, l: '2시간 이내' }, { v: 3, l: '3시간 이내' }, { v: 4, l: '4시간 이내' }, { v: 6, l: '반나절' }],
  },
  {
    key: 'people', name: '인원', title: '몇 명이 함께 가요?', hint: '총 예산을 인원수로 계산해요',
    opts: [{ v: 1, l: '혼자' }, { v: 2, l: '2명' }, { v: 3, l: '3명' }, { v: 4, l: '4명 이상' }],
  },
  {
    key: 'budget', name: '예산', title: '1인 예산은요?', hint: '1인 기준 총액으로 걸러요',
    opts: [{ v: 0, l: '상관없음' }, { v: 20000, l: '2만원 이하' }, { v: 35000, l: '3.5만원 이하' }, { v: 50000, l: '5만원 이하' }, { v: 80000, l: '8만원 이하' }],
  },
]

export const Q: {
  key: TasteKey | 'tags'
  name: string
  multi?: boolean
  opts: { v: string; l: string }[]
}[] = [
  { key: 'mood', name: '쉬는 방식', opts: [{ v: 'calm', l: '조용히 쉬기' }, { v: 'active', l: '몸 쓰기' }, { v: 'new', l: '안 해본 것' }, { v: 'food', l: '맛있는 것' }] },
  { key: 'crowd', name: '사람 많은 곳', opts: [{ v: 'busy', l: '북적이는 곳' }, { v: 'mid', l: '적당한 곳' }, { v: 'quiet', l: '한적한 곳' }] },
  { key: 'hour', name: '자주 나가는 시간', opts: [{ v: 'morning', l: '아침' }, { v: 'noon', l: '낮' }, { v: 'sunset', l: '노을 무렵' }, { v: 'night', l: '밤' }] },
  { key: 'spend', name: '돈을 쓰는 곳', opts: [{ v: 'cafe', l: '커피·디저트' }, { v: 'meal', l: '제대로 한 끼' }, { v: 'drink', l: '술 한잔' }, { v: 'play', l: '문화·체험' }] },
  { key: 'pace', name: '움직이는 방식', opts: [{ v: 'walk', l: '많이 걷기' }, { v: 'sit', l: '한 곳에 오래 앉기' }] },
  { key: 'tags', multi: true, name: '사진에서 자주 나온 것', opts: [{ v: '전시', l: '전시' }, { v: '야경', l: '야경' }, { v: '사진', l: '사진 찍기' }, { v: '로컬', l: '동네 가게' }, { v: '기록', l: '기록·수집' }, { v: '자연', l: '초록·물가' }] },
]

export interface Photo { d: string; h: number; place: string; spot: string; n: number; tone: string; tag: string }

/** 지난 7일 사진 메타데이터 (기기 안에서 읽었다고 가정한 더미) */
export const PHOTOS: Photo[] = [
  { d: '월', h: 19, place: '식당', spot: '연남 소바', n: 2, tone: '#8C6A4A', tag: '로컬' }, { d: '월', h: 20, place: '바', spot: '연남 스탠딩바', n: 2, tone: '#4A4458', tag: '야경' },
  { d: '화', h: 18, place: '거리', spot: '연트럴파크', n: 1, tone: '#7A5C6E', tag: '야경' }, { d: '화', h: 13, place: '카페', spot: '성수 로스터리', n: 1, tone: '#B79A76', tag: '기록' },
  { d: '수', h: 17, place: '공원', spot: '서울숲', n: 2, tone: '#6F8B5A', tag: '자연' }, { d: '수', h: 18, place: '강변', spot: '중랑천', n: 2, tone: '#8E7E5C', tag: '자연' },
  { d: '수', h: 19, place: '바', spot: '성수 와인바', n: 2, tone: '#514A63', tag: '야경' }, { d: '목', h: 12, place: '카페', spot: '성수 로스터리', n: 1, tone: '#A98C6B', tag: '기록' },
  { d: '목', h: 18, place: '거리', spot: '연무장길', n: 2, tone: '#9A6E52', tag: '사진' }, { d: '금', h: 20, place: '바', spot: '성수 와인바', n: 2, tone: '#3F3A50', tag: '야경' },
  { d: '금', h: 21, place: '식당', spot: '을지로 전집', n: 3, tone: '#7B5B45', tag: '로컬' }, { d: '토', h: 11, place: '공원', spot: '서울숲', n: 2, tone: '#7E9B63', tag: '자연' },
  { d: '토', h: 16, place: '전시장', spot: '성수 갤러리', n: 2, tone: '#8A8A93', tag: '전시' }, { d: '토', h: 17, place: '거리', spot: '연무장길', n: 2, tone: '#A8724F', tag: '사진' },
  { d: '토', h: 18, place: '강변', spot: '서울숲 나루', n: 2, tone: '#9B7350', tag: '야경' }, { d: '토', h: 19, place: '바', spot: '성수 와인바', n: 2, tone: '#4C4560', tag: '야경' },
  { d: '일', h: 10, place: '카페', spot: '성수 로스터리', n: 1, tone: '#BBA383', tag: '기록' }, { d: '일', h: 14, place: '전시장', spot: '을지로 갤러리', n: 2, tone: '#93939C', tag: '전시' },
  { d: '일', h: 16, place: '공원', spot: '서울숲', n: 2, tone: '#75925E', tag: '자연' }, { d: '일', h: 17, place: '거리', spot: '연무장길', n: 2, tone: '#A57A55', tag: '사진' },
  { d: '일', h: 18, place: '강변', spot: '서울숲 나루', n: 2, tone: '#946F4E', tag: '야경' }, { d: '일', h: 20, place: '식당', spot: '성수 정식', n: 2, tone: '#82604A', tag: '로컬' },
  { d: '금', h: 13, place: '카페', spot: '성수 로스터리', n: 1, tone: '#B2966F', tag: '기록' }, { d: '화', h: 17, place: '공원', spot: '서울숲', n: 2, tone: '#6C8757', tag: '자연' },
]

export interface CardTxn { d: string; h: number; cat: string; kind: 'meal' | 'drink' | 'cafe' | 'play' | 'etc'; amt: number }

/** 지난 7일 카드 승인내역 (업종·금액만) */
export const CARDS: CardTxn[] = [
  { d: '월', h: 19, cat: '한식', kind: 'meal', amt: 32000 },
  { d: '월', h: 21, cat: '주점', kind: 'drink', amt: 41000 },
  { d: '화', h: 13, cat: '카페', kind: 'cafe', amt: 11500 },
  { d: '수', h: 18, cat: '편의점', kind: 'etc', amt: 6400 },
  { d: '수', h: 20, cat: '와인바', kind: 'drink', amt: 54000 },
  { d: '목', h: 12, cat: '카페', kind: 'cafe', amt: 9800 },
  { d: '목', h: 19, cat: '일식', kind: 'meal', amt: 46000 },
  { d: '금', h: 13, cat: '카페', kind: 'cafe', amt: 12000 },
  { d: '금', h: 21, cat: '주점', kind: 'drink', amt: 38000 },
  { d: '토', h: 11, cat: '베이커리', kind: 'cafe', amt: 14200 },
  { d: '토', h: 16, cat: '전시·공연', kind: 'play', amt: 18000 },
  { d: '토', h: 20, cat: '와인바', kind: 'drink', amt: 62000 },
  { d: '일', h: 10, cat: '카페', kind: 'cafe', amt: 10500 },
  { d: '일', h: 14, cat: '전시·공연', kind: 'play', amt: 15000 },
  { d: '일', h: 20, cat: '한식', kind: 'meal', amt: 36000 },
]

export interface CourseItem { k: string; n: string; d: number; c: number; note: string }
export interface Course {
  id: string; title: string; area: string; tint: string; start: number
  traits: Record<TasteKey, string>
  tags: string[]
  why: string
  items: CourseItem[]
}

export const COURSES: Course[] = [
  { id: 'c1', title: '노을까지 걷다가 한잔', area: '성수', tint: '#00A46E', start: 16,
    traits: { mood: 'calm', crowd: 'quiet', hour: 'sunset', spend: 'drink', pace: 'walk' }, tags: ['야경', '자연', '사진'],
    why: '해 지는 시간에 맞춰 걷다가, 어두워지면 자리를 잡는 순서예요.',
    items: [{ k: '산책', n: '서울숲 남쪽 느티나무길', d: 45, c: 0, note: '사람 적은 남쪽 입구부터 걸어요' },
            { k: '카페', n: '연무장길 로스터리 2층', d: 45, c: 6500, note: '창가 자리가 비면 무조건 거기로' },
            { k: '한잔', n: '골목 와인바', d: 80, c: 24000, note: '글라스 두 잔 기준, 안주는 하나만' }] },
  { id: 'c2', title: '손으로 만드는 오후', area: '성수', tint: '#8FBF2E', start: 14,
    traits: { mood: 'new', crowd: 'mid', hour: 'noon', spend: 'play', pace: 'sit' }, tags: ['기록', '사진'],
    why: '처음의 어색함을 손 쓰는 일로 넘기는 코스예요. 끝나면 얘기할 게 생겨요.',
    items: [{ k: '체험', n: '도자기 원데이 클래스', d: 90, c: 32000, note: '컵 하나 만들고 2주 뒤에 받아요' },
            { k: '식사', n: '성수 정식집', d: 70, c: 18000, note: '이름 미리 적어두면 대기 없어요' },
            { k: '카페', n: '작은 디저트 가게', d: 45, c: 7500, note: '앉을 자리 두 개뿐, 포장도 좋아요' }] },
  { id: 'c3', title: '맛부터 시작하는 연남', area: '연남', tint: '#00795A', start: 12,
    traits: { mood: 'food', crowd: 'busy', hour: 'noon', spend: 'meal', pace: 'walk' }, tags: ['로컬', '사진'],
    why: '배를 먼저 채우고 걷는 순서라 뒤로 갈수록 편해져요.',
    items: [{ k: '식사', n: '연남 소바집', d: 60, c: 14000, note: '12시 전에 가면 웨이팅 없어요' },
            { k: '산책', n: '연트럴파크 걷기', d: 35, c: 0, note: '동교동 쪽에서 시작하면 한적해요' },
            { k: '카페', n: '스콘 나오는 시간의 카페', d: 45, c: 8000, note: '3시쯤 갓 구운 걸 만나요' }] },
  { id: 'c4', title: '을지로 밤 골목 한 바퀴', area: '을지로', tint: '#00A46E', start: 19,
    traits: { mood: 'food', crowd: 'busy', hour: 'night', spend: 'drink', pace: 'walk' }, tags: ['야경', '로컬', '사진'],
    why: '해 지고 간판이 켜지면 시작하는 코스. 나눠 먹기 좋은 것만 골랐어요.',
    items: [{ k: '산책', n: '인쇄 골목 야경 걷기', d: 30, c: 0, note: '간판 불빛이 살아나는 시간' },
            { k: '식사', n: '노가리·전집 골목', d: 70, c: 13000, note: '2~3개만 시켜서 나눠 먹기' },
            { k: '한잔', n: '옥상 맥주', d: 70, c: 17000, note: '남산 보이는 쪽 테이블 노려요' }] },
  { id: 'c5', title: '혼자 재충전하는 한남', area: '한남', tint: '#8FBF2E', start: 13,
    traits: { mood: 'calm', crowd: 'quiet', hour: 'noon', spend: 'cafe', pace: 'sit' }, tags: ['전시', '기록'],
    why: '말 안 해도 되는 코스예요. 앉는 시간을 가장 길게 뒀어요.',
    items: [{ k: '문화', n: '동네 사진전', d: 60, c: 12000, note: '티켓 현장 구매 가능, 평일이 한가해요' },
            { k: '카페', n: '조용한 티하우스', d: 50, c: 9000, note: '노트 펼쳐두기 좋은 소음 정도' },
            { k: '산책', n: '남산 아랫길', d: 45, c: 0, note: '경사 완만한 쪽으로만 돌아요' }] },
  { id: 'c6', title: '전시 두 개 붙여 보기', area: '을지로', tint: '#00795A', start: 13,
    traits: { mood: 'new', crowd: 'quiet', hour: 'noon', spend: 'play', pace: 'walk' }, tags: ['전시', '기록', '사진'],
    why: '작은 전시 두 곳을 걸어서 잇습니다. 사이에 커피 한 잔이 딱 들어가요.',
    items: [{ k: '문화', n: '오래된 빌딩 속 갤러리', d: 35, c: 4000, note: '엘리베이터 없는 4층이에요' },
            { k: '카페', n: '노포 커피, 2층 다락', d: 45, c: 5500, note: '자리 네 개뿐, 계단 조심' },
            { k: '문화', n: '독립서점 겸 전시장', d: 40, c: 0, note: '엽서 한 장 사서 나오면 좋아요' }] },
  { id: 'c7', title: '땀 흘리고 먹기', area: '한남', tint: '#00A46E', start: 15,
    traits: { mood: 'active', crowd: 'mid', hour: 'noon', spend: 'play', pace: 'walk' }, tags: ['자연', '기록'],
    why: '몸을 먼저 쓰고 밥으로 마무리해요. 편한 옷만 있으면 됩니다.',
    items: [{ k: '체험', n: '클라이밍 첫 체험', d: 90, c: 25000, note: '신발 대여 포함, 편한 옷으로' },
            { k: '식사', n: '해방촌 파스타', d: 70, c: 21000, note: '파스타+샐러드 나눠 먹기' },
            { k: '한잔', n: '동네 칵테일 바', d: 70, c: 26000, note: '초저녁이 한가해요' }] },
  { id: 'c8', title: '아침에 여는 브런치 루트', area: '연남', tint: '#8FBF2E', start: 9,
    traits: { mood: 'food', crowd: 'quiet', hour: 'morning', spend: 'meal', pace: 'walk' }, tags: ['로컬', '자연'],
    why: '아침 사람 적은 시간에 시작해서 점심 전에 끝나는 짧은 코스.',
    items: [{ k: '식사', n: '아침 일찍 여는 브런치집', d: 60, c: 16000, note: '9시 오픈, 10시 전이 조용해요' },
            { k: '산책', n: '경의선 숲길 아침 걷기', d: 40, c: 0, note: '그늘 있는 쪽으로 걸어요' },
            { k: '카페', n: '로스터리 아침 커피', d: 40, c: 6000, note: '원두 사가면 하루가 이어져요' }] },
  { id: 'c9', title: '보드게임하고 야식', area: '연남', tint: '#00795A', start: 18,
    traits: { mood: 'active', crowd: 'busy', hour: 'night', spend: 'play', pace: 'sit' }, tags: ['기록'],
    why: '앉아서 오래 노는 코스. 처음 만난 사람들과도 잘 굴러가요.',
    items: [{ k: '체험', n: '보드게임 카페', d: 90, c: 12000, note: '짧은 2인용 게임부터 시작해요' },
            { k: '식사', n: '늦게까지 하는 국숫집', d: 50, c: 11000, note: '11시까지 주문 받아요' },
            { k: '한잔', n: '경의선 옆 스탠딩 바', d: 60, c: 20000, note: '자리 없으면 밖에 서서 한 잔' }] },
]

/** 코스별 구간 이동 (items 사이) */
export const LEGS: Record<string, { m: string; t: number; d: string }[]> = {
  c1: [{ m: '도보', t: 9, d: '700m' }, { m: '도보', t: 7, d: '550m' }],
  c2: [{ m: '도보', t: 6, d: '450m' }, { m: '도보', t: 4, d: '300m' }],
  c3: [{ m: '도보', t: 11, d: '850m' }, { m: '도보', t: 5, d: '400m' }],
  c4: [{ m: '도보', t: 8, d: '600m' }, { m: '도보', t: 6, d: '450m' }],
  c5: [{ m: '버스', t: 12, d: '2.4km · 110번' }, { m: '도보', t: 9, d: '700m' }],
  c6: [{ m: '도보', t: 7, d: '500m' }, { m: '지하철', t: 13, d: '2정거장 · 2호선' }],
  c7: [{ m: '택시', t: 9, d: '3.1km · 약 6,800원' }, { m: '도보', t: 6, d: '450m' }],
  c8: [{ m: '도보', t: 10, d: '800m' }, { m: '도보', t: 5, d: '400m' }],
  c9: [{ m: '도보', t: 6, d: '450m' }, { m: '택시', t: 8, d: '2.6km · 약 5,900원' }],
}

/** 코스별 마커 좌표 (패널 내 %) */
export const MAPXY: Record<string, [number, number][]> = {
  c1: [[22, 68], [52, 44], [78, 24]], c2: [[26, 30], [58, 56], [80, 70]],
  c3: [[18, 52], [48, 34], [76, 60]], c4: [[24, 62], [54, 40], [82, 52]],
  c5: [[20, 34], [56, 62], [80, 30]], c6: [[26, 58], [50, 30], [78, 62]],
  c7: [[18, 40], [52, 66], [80, 38]], c8: [[22, 46], [52, 24], [78, 56]],
  c9: [[24, 36], [56, 58], [80, 26]],
}

export function moveTint(m: string) {
  return m === '도보' ? '#00A46E' : m === '택시' ? '#C08A1E' : '#4A7FB5'
}

export function hhmm(m: number) {
  const h = Math.floor(m / 60) % 24
  const mm = m % 60
  return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0')
}

export function durLabel(m: number) {
  const h = Math.floor(m / 60)
  const mm = m % 60
  return h ? (mm ? `${h}시간 ${mm}분` : `${h}시간`) : `${mm}분`
}

export function won(n: number) {
  return n.toLocaleString('ko-KR') + '원'
}

export function label(opts: { v: string | number; l: string }[], v: string | number | undefined) {
  const f = opts.find((o) => o.v === v)
  return f ? f.l : ''
}
