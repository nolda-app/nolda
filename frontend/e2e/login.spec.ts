import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { API, FRONT, json, mockPlaceDetails, mockPlaces } from './fixtures'

// 로그인 플로우: 로그인이 필요한 화면 → 로그인 화면 → (구글) → 앱으로 복귀 → 원래 가려던 화면
// 구글 동의 화면은 거치지 않는다: 실제 백엔드가 만든 인가 주소만 확인하고, 돌아오는 동작은 "프론트로 리다이렉트"로 흉내 낸다.
// 로그인 토큰 확인(GET /auth/me)은 DB가 없으므로 대신 답한다.
test.use({ reducedMotion: 'reduce' })

const TOKEN_KEY = 'nolda:login-token'
const ME = { id: 'u1', nickname: '테스트유저', email: 'e2e@example.com', avatar_url: null, provider: 'google' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('nolda:splashed', '1')) // 스플래시 건너뛰기 (게스트는 아님)
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort())
  await mockPlaces(page)
  await mockPlaceDetails(page)
})

const mockMe = (page: Page, status = 200) =>
  page.route(`${API}/auth/me`, (route) => (route.request().method() === 'GET' ? json(route, status === 200 ? ME : { detail: '만료' }, status) : route.fallback()))

test('로그인 없이 취향 분석에 들어가면 로그인 화면으로 갔다가, 둘러보기를 고르면 원래 화면으로 간다', async ({ page }) => {
  await page.goto('/start')
  await expect(page).toHaveURL(/\/login\?next=%2Fstart$/)

  await page.getByText('로그인 없이 둘러보기').click()
  await expect(page).toHaveURL(/\/start$/)
  await expect(page.getByRole('button', { name: '취향 분석 시작' })).toBeVisible()
})

test('구글로 로그인하면 원래 가려던 화면으로 돌아오고 로그인 상태가 유지된다', async ({ page }) => {
  await mockMe(page)
  let authUrl = ''
  await page.route(`${API}/auth/login/google`, async (route) => {
    const res = await route.fetch({ maxRedirects: 0 }) // 실제 백엔드가 만든 인가 주소
    authUrl = res.headers()['location'] ?? ''
    return route.fulfill({ status: 302, headers: { location: `${FRONT}/?login_token=e2e-token` } }) // 구글 대신 앱으로 복귀
  })

  await page.goto('/start')
  await expect(page).toHaveURL(/\/login\?next=%2Fstart$/)
  await page.getByText('Google로 계속하기').click()

  await expect(page).toHaveURL(/\/start$/)
  expect(new URL(authUrl).host).toBe('accounts.google.com')
  expect(await page.evaluate((k) => localStorage.getItem(k), TOKEN_KEY)).toBe('e2e-token')

  await page.reload() // 새로고침해도 다시 로그인하지 않는다
  await expect(page).toHaveURL(/\/start$/)
})

test('로그인이 취소되면 안내하고 홈으로 돌아갈 수 있다', async ({ page }) => {
  await page.goto('/?login_error=cancelled')
  await expect(page).toHaveURL(/\/login\?error=/)
  await expect(page.getByText('로그인에 실패했어요')).toBeVisible()
  await expect(page.getByText('카카오 로그인을 취소했어요.')).toBeVisible()

  await page.getByText('홈으로 돌아가기').click()
  await expect(page).toHaveURL(/\/$/)
})

test('방금 받은 로그인 토큰이 서버에서 거절되면 로그인 실패로 안내한다', async ({ page }) => {
  await mockMe(page, 401)
  await page.goto('/?login_token=bad-token')
  await expect(page.getByText('로그인에 실패했어요')).toBeVisible()
  await expect(page.getByText('로그인 확인에 실패했어요. 다시 시도해 주세요.')).toBeVisible()
  expect(await page.evaluate((k) => localStorage.getItem(k), TOKEN_KEY)).toBeNull()
})

test('저장돼 있던 토큰이 만료됐으면 로그아웃 처리되어 다시 로그인하게 한다', async ({ page }) => {
  await page.addInitScript(([k]) => localStorage.setItem(k, 'old-token'), [TOKEN_KEY])
  await mockMe(page, 401)
  await page.goto('/my')
  await expect(page.getByText('로그인이 필요해요')).toBeVisible()
  expect(await page.evaluate((k) => localStorage.getItem(k), TOKEN_KEY)).toBeNull()
})

test('로그인한 사용자는 마이페이지에서 로그아웃할 수 있다', async ({ page }) => {
  await page.addInitScript(([k]) => localStorage.setItem(k, 'good-token'), [TOKEN_KEY])
  await mockMe(page)
  await page.route(`${API}/me/saved`, (route) => json(route, { courses: [] }))
  await page.goto('/my')
  await expect(page.getByText('테스트유저')).toBeVisible()

  await page.getByRole('button', { name: '로그아웃' }).click() // 확인 창
  await page.getByRole('button', { name: '로그아웃' }).last().click()
  await expect(page).toHaveURL(/\/$/)
  expect(await page.evaluate((k) => localStorage.getItem(k), TOKEN_KEY)).toBeNull()
})
