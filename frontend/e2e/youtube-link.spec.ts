import { expect, test } from '@playwright/test'
import type { Page, Request } from '@playwright/test'
import { API, FRONT, TASTE_PROFILE, YOUTUBE_TASTE, json, mockPlaces } from './fixtures'

// 유튜브 연동 플로우: 앱 → (실제 백엔드) → 구글 → (실제 백엔드) → 앱
// 구글 동의 화면과 OpenAI 호출만 대신하고, 나머지 백엔드 호출은 실제 서버로 간다.
// 구글 쪽은 자동화가 막혀 있어서, 구글이 돌려보내는 동작을 "프론트로 리다이렉트"로 흉내 낸다.
test.use({ reducedMotion: 'reduce' }) // 시작 버튼 연출을 건너뛴다


/** 실제 백엔드의 /auth/youtube/login을 호출해 구글 인가 주소(Location)를 받아 두고, 구글로 가는 대신 respond가 정한 곳으로 보낸다.
 *  리다이렉트 뒤의 구글 요청은 Playwright가 가로채지 못해서, 리다이렉트 직전에 우리가 끊는다 (실제 구글에는 요청하지 않는다) */
async function stubGoogle(page: Page, respond: { to: string } | { html: string }) {
  const seen = { authUrl: '' }
  await page.route(`${API}/auth/youtube/login`, async (route) => {
    const res = await route.fetch({ maxRedirects: 0 })
    seen.authUrl = res.headers()['location'] ?? ''
    if ('to' in respond) return route.fulfill({ status: 302, headers: { location: respond.to } })
    return route.fulfill({ contentType: 'text/html', body: respond.html })
  })
  return seen
}
const ID = 'e2e-yt-id'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('nolda:splashed', '1') // 스플래시 건너뛰기
    sessionStorage.setItem('nolda:guest', '1') // 로그인 없이 둘러보기 — /start·/scan은 로그인 또는 게스트만 들어간다
  })
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort()) // 폰트는 기본 폰트로 대체된다
  await mockPlaces(page)
})

async function pickYoutubeAndStart(page: Page) {
  await page.goto('/start')
  const tile = page.getByRole('button', { name: /유튜브/ })
  // 화면이 뜬 직후의 초기화와 겹칠 수 있어서, 선택 표시가 켜질 때까지 확인한다
  await expect(async () => {
    if (!(await tile.innerText()).includes('좋아요')) await tile.click()
    await expect(tile).toContainText('좋아요·구독', { timeout: 1500 })
  }).toPass()
  await page.getByRole('button', { name: '취향 분석 시작' }).click()
}

test('유튜브를 골라 시작하면 실제 백엔드를 거쳐 구글 인가 화면으로 간다', async ({ page }) => {
  const seen = await stubGoogle(page, { html: 'google' })

  await pickYoutubeAndStart(page)
  await expect.poll(() => seen.authUrl).not.toBe('')

  const u = new URL(seen.authUrl)
  expect(u.host).toBe('accounts.google.com')
  expect(u.searchParams.get('client_id')).toBe('e2e-client')
  expect(u.searchParams.get('response_type')).toBe('code')
  expect(u.searchParams.get('scope')).toContain('youtube.readonly')
  expect(u.searchParams.get('redirect_uri')).toBe(`${API}/auth/youtube/callback`)
})

test('구글에서 돌아오면 /scan으로 이어서 분석을 시작하고, 취향 분석 요청에 연동 id를 싣는다', async ({ page }) => {
  // 구글이 동의를 받고 백엔드를 거쳐 프론트로 돌려보내는 동작을 대신한다
  await stubGoogle(page, { to: `${FRONT}/?yt=${ID}` })
  await page.route(`${API}/youtube/taste/${ID}`, (route) => json(route, YOUTUBE_TASTE)) // 실제로는 구글 토큰으로 집계한 값

  let analyze: Request | undefined
  await page.route(`${API}/taste/analyze`, (route) => { analyze = route.request(); return json(route, TASTE_PROFILE) }) // OpenAI는 부르지 않는다

  await pickYoutubeAndStart(page)

  await expect(page).toHaveURL(/\/scan$/)
  await expect.poll(() => analyze).toBeDefined()
  expect(analyze!.method()).toBe('POST')
  expect(analyze!.postDataJSON()).toEqual({ yt_id: ID, photos: [] })
  expect(new URL(page.url()).search).toBe('') // ?yt=… 쿼리는 처리하고 주소에서 지운다
})

test('구글에서 연결을 취소하면 /start로 돌아와 안내한다', async ({ page }) => {
  await stubGoogle(page, { to: `${FRONT}/?yt_error=access_denied` })

  await pickYoutubeAndStart(page)

  await expect(page).toHaveURL(/\/start$/)
  await expect(page.getByText('유튜브 연결을 취소했어요')).toBeVisible()
})

test('연동 결과가 만료됐으면(실제 백엔드가 404) /start로 돌아와 다시 연결하라고 안내한다', async ({ page }) => {
  await page.goto('/?yt=expired-id')

  await expect(page).toHaveURL(/\/start$/)
  await expect(page.getByText('유튜브 연동이 만료됐어요')).toBeVisible()
})

test('유튜브 요청이 실패해도(실제 백엔드가 실패 처리) 앱으로 돌아와 안내한다', async ({ page }) => {
  // 구글이 돌려준 것처럼 유효하지 않은 state로 실제 백엔드의 콜백을 연다 → 백엔드가 실패로 처리하고 앱으로 돌려보내야 한다
  await page.goto(`${API}/auth/youtube/callback?code=bad&state=bad`)

  await expect(page).toHaveURL(/\/start$/)
  await expect(page.getByText('유튜브 연결에 실패했어요')).toBeVisible()
})
