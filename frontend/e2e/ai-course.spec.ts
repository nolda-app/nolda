import { expect, test } from '@playwright/test'
import type { Page, Request } from '@playwright/test'
import { API, PLACES, TASTE_PROFILE, YOUTUBE_TASTE, json, mockPlaceDetails, mockPlaces } from './fixtures'

// 취향 기반 AI 코스 추천 플로우: /start(사진·유튜브 고르기) → /scan(분석) → 취향 유형 → /summary → /courses(AI 코스)
// OpenAI를 부르는 두 API(/taste/analyze, /courses)는 성공 응답만 대신하고, 실패 케이스는 실제 백엔드가 낸다
// (e2e 백엔드는 OPENAI_API_KEY가 비어 있어서 두 API 모두 502로 실패한다 — 그대로 "AI가 안 될 때"의 실제 동작이다).
// 구글 동의 화면은 거치지 않는다: 연동 결과 id를 미리 넣어 두고 /youtube/taste/{id}만 대신 답한다.
test.use({ reducedMotion: 'reduce' }) // 시작 버튼·분석 중 최소 노출 연출을 건너뛴다

// AI 분석·코스 생성이 이 시간 안에 화면에 반영돼야 한다 (화면 안내 문구도 "30초~1분"). 가짜 응답을 쓰므로 앱 쪽 지연만 잰다
const FLOW_BUDGET_MS = 60_000

const YT_KEY = 'nolda:yt-id'
const YT_ID = 'e2e-yt-id'
const AI_TITLES = ['망원 노을 산책 코스', '연남 카페 투어', '합정 전시 데이트', '상수 골목 한잔']

/** 백엔드가 돌려주는 AI 코스 모양 (장소는 fixtures의 PLACES를 가리킨다) */
const aiCourses = () => AI_TITLES.map((title, i) => ({
  id: `ai-${i + 1}`, title, area: '연남', tint: '#00A46E', start: 12,
  traits: { mood: 'calm', crowd: 'mid', hour: 'noon', spend: 'cafe', pace: 'mid' }, tags: ['감성'],
  why: '테스트용 코스예요',
  items: [
    { k: '카페', n: PLACES[0].name, d: 60, c: 7000, note: '카페', pid: PLACES[0].id },
    { k: '산책', n: PLACES[2].name, d: 50, c: 0, note: '산책', pid: PLACES[2].id },
  ],
  legs: [{ m: '도보', t: 8, d: '500m' }],
  estimated: true, shareable: true, source: 'taste',
}))

const PHOTO_PROFILE = {
  ...TASTE_PROFILE,
  base: { mood: 'calm', spend: 'cafe' },
  fixed: { crowd: 'quiet', hour: 'noon', pace: 'mid', plan: 'relaxed', companion: 'couple' },
  tags: ['감성', '사진'], highlights: ['2명이 자주 찍혀요'],
  weights: { photo: 1, youtube: 0 },
  photo: { total: 3, days: 2, party: 2, error: '' }, youtube: { likes: 0, subs: 0 },
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('nolda:splashed', '1') // 스플래시 건너뛰기
    sessionStorage.setItem('nolda:guest', '1') // 로그인 없이 둘러보기
  })
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort())
  await mockPlaces(page)
  await mockPlaceDetails(page)
})

// ── 도우미 ───────────────────────────────────────────────

/** 실제 JPEG n장 (EXIF 없음 — 앱이 파일 수정 시각으로 촬영 시각을 대신한다) */
async function makePhotos(page: Page, n: number) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 48
    const g = c.getContext('2d')!; g.fillStyle = '#c33'; g.fillRect(0, 0, 64, 48)
    return c.toDataURL('image/jpeg').split(',')[1]
  })
  return Array.from({ length: n }, (_, i) => ({ name: `photo${i}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') }))
}

const tile = (page: Page, name: RegExp) => page.getByRole('button', { name })

/** /start에서 사진 n장만 고른다 (유튜브는 끈다) */
async function pickPhotosOnly(page: Page, n: number) {
  await page.goto('/start')
  await page.locator('input[type=file]').setInputFiles(await makePhotos(page, n))
  await expect(tile(page, /사진첩/)).toContainText(`${n}장`)
  await expect(async () => { // 화면이 뜬 직후의 초기화와 겹칠 수 있어서, 꺼질 때까지 확인한다
    if ((await tile(page, /유튜브/).innerText()).includes('좋아요')) await tile(page, /유튜브/).click()
    await expect(tile(page, /유튜브/)).toContainText('연결 안 함', { timeout: 1500 })
  }).toPass()
}

/** 연동을 마친 상태(구글을 한 번 거친 뒤)로 /start에 들어온다 */
async function openStartWithYoutube(page: Page) {
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [YT_KEY, YT_ID])
  await page.route(`${API}/youtube/taste/${YT_ID}`, (route) => json(route, YOUTUBE_TASTE))
  await page.goto('/start')
  await expect(async () => {
    if (!(await tile(page, /유튜브/).innerText()).includes('좋아요')) await tile(page, /유튜브/).click()
    await expect(tile(page, /유튜브/)).toContainText('좋아요·구독', { timeout: 1500 })
  }).toPass()
}

const startAnalysis = (page: Page) => tile(page, /취향 분석 시작/).click()

/** 분석이 끝나면 나오는 "내 취향 유형 공개하기" → "내 취향 자세히 보기" → /summary */
async function revealToSummary(page: Page) {
  await page.getByRole('button', { name: /내 취향 유형 공개하기/ }).click()
  await page.getByRole('button', { name: /내 취향 자세히 보기/ }).click()
  await expect(page).toHaveURL(/\/summary$/)
}

/** 코스 추천 받기 → /courses */
async function toCourses(page: Page) {
  await page.getByText('AI 코스 추천 받기').click()
  await expect(page).toHaveURL(/\/courses$/)
}

const stubAnalyze = (page: Page, profile: unknown, delayMs = 0) => {
  const seen: { req?: Request } = {}
  return page.route(`${API}/taste/analyze`, async (route) => {
    seen.req = route.request()
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
    return json(route, profile)
  }).then(() => seen)
}

// 개발 서버는 StrictMode라 코스 화면의 첫 요청이 두 번 나간다(앞의 것은 앱이 바로 취소). 실제로 쓰이는 건 마지막 요청이다
const lastOf = (reqs: Request[]) => reqs[reqs.length - 1]

const stubCourses = (page: Page, delayMs = 0) => {
  const seen: { reqs: Request[] } = { reqs: [] }
  return page.route(`${API}/courses`, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    seen.reqs.push(route.request())
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
    return json(route, { courses: aiCourses() })
  }).then(() => seen)
}

// ── 사진 → 취향 분석 → AI 코스 ───────────────────────────

test.describe('사진으로 AI 코스 추천 받기', () => {
  test('사진을 고르면 분석 → 요약 → AI 코스 4개까지 이어지고, 제한 시간 안에 끝난다', async ({ page }) => {
    const analyze = await stubAnalyze(page, PHOTO_PROFILE)
    const courses = await stubCourses(page)

    await pickPhotosOnly(page, 3)
    const t0 = Date.now()
    await startAnalysis(page)
    await expect(page).toHaveURL(/\/scan$/)
    await revealToSummary(page)

    // 분석 요청: 사진 데이터가 실려 가고, 유튜브는 없다
    const body = analyze.req!.postDataJSON()
    expect(body.yt_id).toBeNull()
    expect(body.photos).toHaveLength(3)
    for (const p of body.photos) {
      expect(p.b64).toMatch(/^data:image\/jpeg;base64,/)
      expect(new Date(p.ts).getTime()).not.toBeNaN()
    }

    // 요약: 분석 결과가 화면에 나온다
    await expect(page.getByText('이런 취향이 보여요')).toBeVisible()
    await expect(page.getByText('사진 3장 분석')).toBeVisible()
    await expect(page.getByText('2명이 자주 찍혀요')).toBeVisible()

    await toCourses(page)
    await expect(page.getByText('추천 코스 4개')).toBeVisible({ timeout: FLOW_BUDGET_MS })
    expect(Date.now() - t0).toBeLessThan(FLOW_BUDGET_MS)

    // 코스 요청: 분석한 취향·조건이 그대로 실린다
    const req = lastOf(courses.reqs).postDataJSON()
    expect(req.taste).toMatchObject({ mood: 'calm', spend: 'cafe', crowd: 'quiet', pace: 'mid', plan: 'relaxed', companion: 'couple' })
    expect(req.tags).toEqual(expect.arrayContaining(['감성', '사진']))
    expect(req.time_window.end).toBeGreaterThan(req.time_window.start)
    expect(req.cond.people).toBe(2) // 연인이면 2명

    // 결과 화면: 4개 코스와 AI 안내
    await expect(page.getByText('취향 맞춤 코스 4개')).toBeVisible()
    for (const title of AI_TITLES) await expect(page.getByText(title)).toBeVisible()
  })

})

// ── 유튜브(+사진) → 취향 분석 ────────────────────────────

test.describe('유튜브 기록으로 분석하기', () => {
  test('연동된 유튜브의 분석 요청에 연동 id가 실리고 요약에 좋아요·구독 수가 나온다', async ({ page }) => {
    const analyze = await stubAnalyze(page, { ...TASTE_PROFILE, tags: ['감성'], highlights: [] })
    await stubCourses(page)
    await openStartWithYoutube(page)

    await startAnalysis(page)
    await expect(page).toHaveURL(/\/scan$/)
    await revealToSummary(page)

    expect(analyze.req!.postDataJSON()).toEqual({ yt_id: YT_ID, photos: [] })
    await expect(page.getByText('유튜브 좋아요 120 · 구독 30 분석')).toBeVisible()
  })

  test('사진과 유튜브를 함께 고르면 한 번의 분석 요청에 둘 다 담긴다', async ({ page }) => {
    const analyze = await stubAnalyze(page, TASTE_PROFILE)
    await openStartWithYoutube(page)
    await page.locator('input[type=file]').setInputFiles(await makePhotos(page, 2))
    await expect(tile(page, /사진첩/)).toContainText('2장')

    await startAnalysis(page)
    await expect.poll(() => analyze.req).toBeDefined()
    const body = analyze.req!.postDataJSON()
    expect(body.yt_id).toBe(YT_ID)
    expect(body.photos).toHaveLength(2)
  })
})

// ── 기다리는 동안의 UX ───────────────────────────────────

test.describe('AI를 기다리는 동안', () => {
  test('분석이 느려도 "AI가 취향을 읽는 중"을 보여주고, 끝나면 다음으로 넘어간다', async ({ page }) => {
    await stubAnalyze(page, PHOTO_PROFILE, 3_000)
    await pickPhotosOnly(page, 1)
    const t0 = Date.now()
    await startAnalysis(page)

    await expect(page.getByText('AI가 취향을 읽는 중')).toBeVisible()
    await expect(page).toHaveURL(/\/scan$/) // 응답 전에는 넘어가지 않는다
    await expect(page.getByText('분석 완료!')).toBeVisible({ timeout: FLOW_BUDGET_MS })
    expect(Date.now() - t0).toBeLessThan(FLOW_BUDGET_MS)

    await revealToSummary(page)
  })

  test('코스를 만드는 동안 안내와 자리표시를 보여주고, 끝나면 목록으로 바뀐다', async ({ page }) => {
    await stubAnalyze(page, PHOTO_PROFILE)
    await stubCourses(page, 2_500)
    await pickPhotosOnly(page, 1)
    await startAnalysis(page)
    await revealToSummary(page)
    await toCourses(page)

    await expect(page.getByText('코스를 만들고 있어요')).toBeVisible()
    await expect(page.getByText('취향에 맞는 코스를 AI가 만들고 있어요')).toBeVisible()
    await expect(page.getByText(AI_TITLES[0])).toHaveCount(0)

    await expect(page.getByText('추천 코스 4개')).toBeVisible({ timeout: FLOW_BUDGET_MS })
    await expect(page.getByText(AI_TITLES[0])).toBeVisible()
  })

  test('분석 중에 취소하면 /start로 돌아간다', async ({ page }) => {
    await stubAnalyze(page, PHOTO_PROFILE, 30_000) // 끝나지 않는 분석
    await pickPhotosOnly(page, 1)
    await startAnalysis(page)
    await expect(page.getByText('AI가 취향을 읽는 중')).toBeVisible()

    await page.getByRole('button', { name: /분석 취소/ }).click()
    await expect(page).toHaveURL(/\/start$/)
  })
})

// ── AI가 안 될 때 ────────────────────────────────────────

test.describe('AI가 실패해도 쓸 수 있다', () => {
  test('사진 분석이 실패하면(실제 백엔드가 502) 기본값으로 요약을 보여준다', async ({ page }) => {
    await pickPhotosOnly(page, 2) // /taste/analyze는 가짜 응답 없이 실제 백엔드로 간다
    await startAnalysis(page)
    await revealToSummary(page)

    await expect(page.getByText('취향 분석에 실패해 기본값으로 맞췄어요')).toBeVisible()
    await expect(page.getByText('AI 코스 추천 받기')).toBeVisible() // 막히지 않고 이어갈 수 있다
  })

  test('유튜브 분석이 실패하면 유튜브 기록만으로 대략 맞춘다고 알린다', async ({ page }) => {
    await openStartWithYoutube(page)
    await startAnalysis(page)
    await revealToSummary(page)

    await expect(page.getByText('취향 분석에 실패해 유튜브 기록만으로 대략 맞췄어요')).toBeVisible()
    await expect(page.getByText('유튜브 좋아요 120 · 구독 30 분석')).toBeVisible()
  })

  test('분석과 코스 생성이 모두 실패해도 기본 코스가 보이고 다시 시도할 수 있다', async ({ page }) => {
    await pickPhotosOnly(page, 1) // 두 API 모두 실제 백엔드 → 502
    await startAnalysis(page)
    await revealToSummary(page)
    await toCourses(page)

    await expect(page.getByText('AI 코스를 만들지 못해 기본 코스를 보여드려요')).toBeVisible({ timeout: FLOW_BUDGET_MS })
    await expect(page.getByText('노을까지 걷다가 한잔')).toBeVisible() // 고정 코스로 화면이 비지 않는다
    await expect(page.getByText('다시 시도')).toBeVisible()
  })

  test('코스 생성만 실패하면 사유를 보여주고, 다시 시도하면 AI 코스로 바뀐다', async ({ page }) => {
    await stubAnalyze(page, PHOTO_PROFILE)
    let failing = true // '다시 시도'를 누르기 전까지 실패
    await page.route(`${API}/courses`, (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      return failing ? json(route, { detail: 'LLM 호출 실패' }, 502) : json(route, { courses: aiCourses() })
    })
    await pickPhotosOnly(page, 1)
    await startAnalysis(page)
    await revealToSummary(page)
    await toCourses(page)

    await expect(page.getByText('AI 코스를 만들지 못해 기본 코스를 보여드려요')).toBeVisible()
    await expect(page.getByText('LLM 호출 실패')).toBeVisible() // 서버가 알려준 사유
    await expect(page.getByText('노을까지 걷다가 한잔')).toBeVisible()

    failing = false
    await page.getByText('다시 시도').click()
    await expect(page.getByText('취향 맞춤 코스 4개')).toBeVisible()
    await expect(page.getByText(AI_TITLES[0])).toBeVisible()
    await expect(page.getByText('노을까지 걷다가 한잔')).toHaveCount(0)
  })

  test('서버에 연결하지 못해도 안내하고 기본 코스를 보여준다', async ({ page }) => {
    await stubAnalyze(page, PHOTO_PROFILE)
    await page.route(`${API}/courses`, (route) => (route.request().method() === 'POST' ? route.abort() : route.fallback()))
    await pickPhotosOnly(page, 1)
    await startAnalysis(page)
    await revealToSummary(page)
    await toCourses(page)

    await expect(page.getByText('백엔드 서버에 연결하지 못했어요')).toBeVisible()
    await expect(page.getByText('노을까지 걷다가 한잔')).toBeVisible()
  })
})

// ── 어떤 기록으로 분석하는지 알려준다 ───────────────────────
// 유튜브와 사진은 둘 다 고를 수도, 하나만 고를 수도 있다. /start는 유튜브가 처음부터 선택돼 있어서
// 사진첩만 눌러도 유튜브는 켜진 채다 — 전에 연동한 기기라면 구글을 다시 거치지 않고 함께 분석한다.
// 그래서 (1) 시작 전에 무엇으로 분석하는지 보여주고 (2) AI 분석이 실패했을 때 어떤 기록이 반영됐는지 안내한다.
test.describe('분석에 쓰이는 기록 안내', () => {
  /** 연동해 둔 기기에서 /start를 열고 사진 n장을 고른다 (유튜브는 건드리지 않는다) */
  async function pickPhotosKeepingYoutube(page: Page, n: number) {
    await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [YT_KEY, YT_ID])
    await page.route(`${API}/youtube/taste/${YT_ID}`, (route) => json(route, YOUTUBE_TASTE))
    await page.goto('/start')
    await page.locator('input[type=file]').setInputFiles(await makePhotos(page, n))
    await expect(tile(page, /사진첩/)).toContainText(`${n}장`)
  }
  const dropYoutube = async (page: Page) => {
    await tile(page, /유튜브/).click()
    await expect(tile(page, /유튜브/)).toContainText('연결 안 함')
  }

  test('시작 전에 유튜브만 / 사진만 / 둘 다 중 무엇으로 분석하는지 보여준다', async ({ page }) => {
    await pickPhotosKeepingYoutube(page, 2)
    await expect(page.getByText('유튜브와 사진을 함께 분석해요')).toBeVisible()

    await dropYoutube(page)
    await expect(page.getByText('사진만 분석해요')).toBeVisible()
    await expect(page.getByText('유튜브와 사진을 함께 분석해요')).toHaveCount(0)

    await tile(page, /유튜브/).click() // 다시 켜면 둘 다
    await expect(page.getByText('유튜브와 사진을 함께 분석해요')).toBeVisible()
  })

  test('둘 다 골랐는데 AI 분석이 실패하면 유튜브로만 맞췄고 사진은 빠졌다고 알린다', async ({ page }) => {
    await pickPhotosKeepingYoutube(page, 2) // /taste/analyze는 실제 백엔드 → 502
    await startAnalysis(page)
    await revealToSummary(page)

    await expect(page.getByText('취향 분석에 실패해 유튜브 기록만으로 대략 맞췄어요 (고른 사진 2장은 반영하지 못했어요)')).toBeVisible()
    await expect(page.getByText('유튜브 좋아요 120 · 구독 30 · 사진 2장(반영 안 됨) 분석')).toBeVisible()
  })

  test('고른 사진이 모두 쓰이면 "사진 N장"으로 보여준다', async ({ page }) => {
    await stubAnalyze(page, { ...TASTE_PROFILE, photo: { total: 2, days: 1, party: 1, error: '' } })
    await pickPhotosKeepingYoutube(page, 2)
    await startAnalysis(page)
    await revealToSummary(page)
    await expect(page.getByText('유튜브 좋아요 120 · 구독 30 · 사진 2장 분석')).toBeVisible()
  })

  test('사진을 많이 골라 일부만 쓰이면 "N장 중 M장"으로 보여준다', async ({ page }) => {
    await stubAnalyze(page, { ...PHOTO_PROFILE, photo: { total: 12, days: 3, party: 2, error: '' } })
    await pickPhotosOnly(page, 15)
    await startAnalysis(page)
    await revealToSummary(page)
    await expect(page.getByText('사진 15장 중 12장 분석')).toBeVisible()
  })

})

// ── 만들어진 코스 열어보기 ───────────────────────────────

test('AI가 만든 코스를 열어 저장할 수 있다', async ({ page }) => {
  await stubAnalyze(page, PHOTO_PROFILE)
  await stubCourses(page)
  await pickPhotosOnly(page, 1)
  await startAnalysis(page)
  await revealToSummary(page)
  await toCourses(page)

  await page.getByText(AI_TITLES[1]).click()
  await expect(page).toHaveURL(/\/course\/ai-2$/)
  await page.getByRole('button', { name: '코스 저장' }).click()
  await expect(page.getByText('저장한 코스에 담았어요')).toBeVisible()

  await page.goto('/saved')
  await expect(page.getByText(AI_TITLES[1])).toBeVisible()
})
