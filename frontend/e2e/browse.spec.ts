import { expect, test } from '@playwright/test'
import { API, json, mockPlaceDetails, mockPlaces } from './fixtures'

// 둘러보기 플로우: 홈 · 탭 이동 · 분석 없이 기본 코스 보기 · 공유 링크로 코스 열기
test.use({ reducedMotion: 'reduce' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('nolda:splashed', '1')
    sessionStorage.setItem('nolda:guest', '1')
  })
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort())
  await mockPlaces(page)
  await mockPlaceDetails(page)
})

test('연결 없이 둘러보기를 누르면 분석 없이 코스 목록으로 간다 (AI가 안 되면 기본 코스)', async ({ page }) => {
  await page.goto('/start')
  await page.getByText('연결 없이 둘러보기').click()

  await expect(page).toHaveURL(/\/courses$/)
  // 기본 취향으로 AI 코스를 요청한다 — e2e 백엔드는 AI가 없어서 기본 코스가 보인다
  await expect(page.getByText('AI 코스를 만들지 못해 기본 코스를 보여드려요')).toBeVisible()
  await expect(page.getByText('노을까지 걷다가 한잔')).toBeVisible()
})

test('분석 전에 코스 탭을 열면 기본 코스를 보여준다', async ({ page }) => {
  await page.goto('/courses')
  await expect(page.getByText('아직 취향 분석 전이라 기본 코스를 보여드려요')).toBeVisible()
  await expect(page.getByText('노을까지 걷다가 한잔')).toBeVisible()
})

test('하단 탭으로 홈·코스·검색·저장·마이페이지를 오갈 수 있다', async ({ page }) => {
  await page.goto('/')
  for (const [name, url] of [['코스', /\/courses$/], ['검색', /\/search$/], ['저장', /\/saved$/], ['마이페이지', /\/my$/], ['홈', /\/$/]] as const) {
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page).toHaveURL(url)
  }
})

test('홈에서 코스 만들기를 시작하면 취향 분석 화면으로 간다', async ({ page }) => {
  await page.goto('/')
  await page.goto('/start') // 게스트는 로그인 없이 들어간다
  await expect(page.getByText('취향 유형 테스트')).toBeVisible()
})

test('공유 링크로 들어오면 그 코스가 열린다', async ({ page }) => {
  const shared = {
    id: 'shared-1', title: '공유받은 산책 코스', area: '연남', tint: '#00A46E', start: 12,
    traits: { mood: 'calm', crowd: 'mid', hour: 'noon', spend: 'cafe', pace: 'mid' }, tags: [], why: '테스트',
    items: [{ k: '카페', n: '테스트카페', d: 60, c: 7000, note: '카페', pid: 'p1' }, { k: '산책', n: '테스트공원', d: 40, c: 0, note: '산책', pid: 'p3' }],
    legs: [{ m: '도보', t: 8, d: '500m' }], shareable: true, source: 'taste',
  }
  await page.route(`${API}/courses/shared-1`, (route) => json(route, shared))

  await page.goto('/?course=shared-1')
  await expect(page).toHaveURL(/\/course\/shared-1$/)
  await expect(page.getByText('공유받은 산책 코스').first()).toBeVisible()
})

test('없는 코스의 공유 링크는 안내하고 코스 목록으로 보낸다', async ({ page }) => {
  await page.route(`${API}/courses/nope`, (route) => json(route, { detail: '코스를 찾을 수 없어요' }, 404))

  await page.goto('/?course=nope')
  await expect(page).toHaveURL(/\/courses$/)
  await expect(page.getByText(/코스를 열지 못했어요/)).toBeVisible()
})
