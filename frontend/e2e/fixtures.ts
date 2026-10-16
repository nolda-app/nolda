// e2e 공용 데이터 — 운영 DB 대신 쓰는 고정 값
import type { Page, Route } from '@playwright/test'

export const FRONT = 'http://localhost:5174'
export const API = 'http://localhost:8765' // playwright.config.ts가 띄우는 실제 백엔드

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
export const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) })

// 장소 10건 — 앱이 시작할 때 /places를 부르는데, 운영 DB를 읽지 않도록 이 값으로 대신 답한다
const KINDS = ['카페', '식당', '공원', '전시', '책방', '술집', '산책', '공방', '영화', '디저트']
export const PLACES = KINDS.map((kind, i) => ({
  id: `p${i + 1}`, name: `테스트${kind}`, cat: kind, addr: '서울 마포구', lat: 37.55 + i * 0.001, lng: 126.92 + i * 0.001,
  kind, area: '연남', tags: [], img: null,
}))

export async function mockPlaces(page: Page) {
  await page.route(`${API}/places`, (route) => json(route, PLACES))
}

// 유튜브 연동 결과 (GET /youtube/taste/{id})
export const YOUTUBE_TASTE = {
  likes: 120, subs: 30,
  categories: [{ name: '음악', ratio: 0.5 }, { name: '여행', ratio: 0.3 }],
  channels: ['채널A'], sub_channels: ['채널B'], tags: ['감성'], topics: ['카페'], titles: ['카페 브이로그'],
  hints: { mood: '감성', spend: null, pace: null, tags: ['감성'], evidence: { mood: '', spend: '', pace: '', tags: '' } },
}

// 취향 분석 결과 (POST /taste/analyze) — OpenAI를 부르지 않고 이 값으로 대신 답한다
export const TASTE_PROFILE = {
  source: 'llm',
  fixed: { crowd: null, hour: null, pace: null, plan: 'balanced', companion: 'couple' },
  base: { mood: null, spend: null },
  scores: {}, weights: { photo: 0, youtube: 1 }, evidence: {}, tags: ['감성'], highlights: [], topics: [],
  photo: { total: 0, days: 0, party: 0, error: '' }, youtube: { likes: 120, subs: 30 },
}
