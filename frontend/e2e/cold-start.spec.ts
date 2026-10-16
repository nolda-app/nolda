import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import { API } from '../playwright.config'

// 콜드스타트: 무료 서버가 잠들어 있다가 한참 뒤에 깨어나는 상황을 가짜 시계와 네트워크 가로채기로 재현한다
const PLACES = [
  { id: 'p1', name: '성수카페', cat: '카페', addr: '서울 성동구', lat: 37.54, lng: 127.05, kind: '카페', area: '성수', img: 'https://img.e2e.test/a.jpg' },
  { id: 'p2', name: '서울숲', cat: '공원', addr: '서울 성동구', lat: 37.55, lng: 127.04, kind: '공원', area: '성수', img: 'https://img.e2e.test/b.jpg' },
]
const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })

/** /places 호출 횟수를 세고, 응답은 respond가 정한다. 나머지 API·이미지는 조용히 막는다 */
async function mockApi(page: Page, respond: (n: number, route: Route) => Promise<void> | void) {
  const calls = { places: 0, health: 0 }
  await page.route(`${API}/**`, async (route) => {
    const { pathname } = new URL(route.request().url())
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
    if (pathname === '/health') { calls.health++; return route.fulfill({ status: 200, body: 'ok' }) }
    if (pathname === '/places') return respond(++calls.places, route)
    return json(route, 404, {})
  })
  await page.route('https://img.e2e.test/**', (route) => route.abort())
  return calls
}

test.beforeEach(async ({ page }) => {
  await page.clock.install() // setTimeout을 직접 앞으로 돌릴 수 있게 — 90초를 실제로 기다리지 않는다
  await page.addInitScript(() => sessionStorage.setItem('nolda:splashed', '1')) // 스플래시 건너뛰기
  // 외부 웹폰트가 느리면 load 이벤트가 늦어져 테스트가 흔들린다 — 빈 CSS로 대신한다
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }))
})

const wakingBanner = (page: Page) => page.getByRole('status').filter({ hasText: '서버를 깨우는 중' })
const retryButton = (page: Page) => page.getByRole('button', { name: '다시 시도' })

test('앱을 열면 /health로 서버를 미리 깨운다', async ({ page }) => {
  const calls = await mockApi(page, (_, route) => json(route, 200, PLACES))
  await page.goto('/')
  await expect.poll(() => calls.health).toBe(1)
})

test('응답이 늦으면 안내와 스켈레톤을 보여주고, 도착하면 장소가 채워진다', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((r) => { release = r })
  await mockApi(page, async (_, route) => { await gate; await json(route, 200, PLACES) })

  await page.goto('/')
  await expect(page.locator('.pl-marquee-skel .pl-pcard')).toHaveCount(5)
  await expect(wakingBanner(page)).toHaveCount(0) // 2.5초 전에는 아직 안내하지 않는다

  await page.clock.fastForward(2600)
  await expect(wakingBanner(page)).toBeVisible()

  release()
  await expect(wakingBanner(page)).toHaveCount(0)
  await expect(page.locator('.pl-marquee-skel')).toHaveCount(0)
  await expect(page.locator('.pl-marquee-track .pl-pcard-name', { hasText: '성수카페' }).first()).toBeAttached()
})

test('서버가 아직 안 깬 동안에도 정적 섹션은 바로 보인다', async ({ page }) => {
  await mockApi(page, () => new Promise(() => {})) // 끝내 응답하지 않는 서버
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '이런 데이트도 좋아요' })).toBeVisible()
  await expect(page.getByRole('button', { name: /코스 만들기/ })).toBeVisible()
})

test('몇 번 실패해도 3초 간격으로 다시 시도해서 결국 복구된다', async ({ page }) => {
  const calls = await mockApi(page, (n, route) => (n <= 2 ? json(route, 503, {}) : json(route, 200, PLACES)))
  await page.goto('/')
  await expect.poll(() => calls.places).toBe(1)
  await expect(retryButton(page)).toHaveCount(0)

  await page.clock.fastForward(3100)
  await expect.poll(() => calls.places).toBe(2)
  await page.clock.fastForward(3100)
  await expect.poll(() => calls.places).toBe(3)

  await expect(page.locator('.pl-marquee-skel')).toHaveCount(0)
  await expect(page.locator('.pl-marquee-track .pl-pcard-name', { hasText: '서울숲' }).first()).toBeAttached()
  await expect(retryButton(page)).toHaveCount(0)
})

test('계속 실패하면 30번 시도한 뒤 다시 시도 버튼이 뜨고, 누르면 다시 불러온다', async ({ page }) => {
  let healthy = false
  const calls = await mockApi(page, (_, route) => (healthy ? json(route, 200, PLACES) : json(route, 503, {})))
  await page.goto('/')
  await expect.poll(() => calls.places).toBe(1)

  for (let i = 0; i < 29; i++) await page.clock.fastForward(3100)
  await expect(retryButton(page)).toBeVisible()
  await expect(page.getByText('장소를 불러오지 못했어요')).toBeVisible()
  const total = calls.places
  expect(total).toBeGreaterThanOrEqual(30)

  await page.clock.fastForward(30_000) // 더는 시도하지 않는다
  expect(calls.places).toBe(total)

  healthy = true
  await retryButton(page).click()
  await expect(page.locator('.pl-marquee-skel')).toHaveCount(0)
  await expect(page.locator('.pl-marquee-track .pl-pcard-name', { hasText: '성수카페' }).first()).toBeAttached()
})

test('검색 화면은 재시도 없이 한 번 실패하면 바로 안내한다', async ({ page }) => {
  const calls = await mockApi(page, (_, route) => json(route, 503, {}))
  await page.goto('/search')
  await expect(page.getByText('장소를 불러오지 못했어요')).toBeVisible()
  const total = calls.places
  await page.clock.fastForward(60_000)
  expect(calls.places).toBe(total)
  await expect(retryButton(page)).toHaveCount(0)
})
