import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { API, mockPlaceDetails, mockPlaces } from './fixtures'

// 코스 저장 플로우 (로그인 없이 둘러보는 게스트): 코스 열기 → 저장 → 저장 탭에서 확인 → 새로고침 후 유지 → 취소
// 게스트의 저장은 이 기기(localStorage)에만 남는다. 서버(DB)에는 아무것도 쓰지 않는다.
const TITLE = '노을까지 걷다가 한잔' // 분석 전에 보이는 고정 코스

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('nolda:splashed', '1') // 스플래시 건너뛰기
    sessionStorage.setItem('nolda:guest', '1')
  })
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort())
  await mockPlaces(page)
  await mockPlaceDetails(page)
})

const heart = (page: Page) => page.getByRole('button', { name: /^(코스 저장|저장 취소)$/ })

async function openCourse(page: Page) {
  await page.goto('/courses')
  await page.getByText(TITLE).first().click()
  await expect(page).toHaveURL(/\/course\/c1$/)
}

test('코스를 열어 저장하면 저장 탭에 담긴다', async ({ page }) => {
  await openCourse(page)
  await expect(heart(page)).toHaveAttribute('aria-pressed', 'false')

  await heart(page).click()
  await expect(heart(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('저장한 코스에 담았어요')).toBeVisible()

  await page.goto('/saved')
  await expect(page.getByText('1개 ·')).toBeVisible()
  await expect(page.getByText(TITLE)).toBeVisible()
})

test('저장한 코스는 새로고침해도 남아 있다', async ({ page }) => {
  await openCourse(page)
  await heart(page).click()
  await expect(heart(page)).toHaveAttribute('aria-pressed', 'true')

  await page.goto('/saved')
  await page.reload()
  await expect(page.getByText(TITLE)).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('nolda:saved-courses'))).toContain('c1')
})

test('저장 탭에서 저장 취소하면 빈 화면이 된다', async ({ page }) => {
  await openCourse(page)
  await heart(page).click()
  await page.goto('/saved')
  await expect(page.getByText(TITLE)).toBeVisible()

  await page.getByText('저장 취소').click()
  await expect(page.getByText('저장을 취소했어요')).toBeVisible()
  await expect(page.getByText('아직 저장한 코스가 없어요')).toBeVisible()
})

test('코스 상세에서 다시 눌러도 저장이 취소된다', async ({ page }) => {
  await openCourse(page)
  await heart(page).click()
  await expect(heart(page)).toHaveAttribute('aria-pressed', 'true')
  await heart(page).click()
  await expect(heart(page)).toHaveAttribute('aria-pressed', 'false')

  await page.goto('/saved')
  await expect(page.getByText('아직 저장한 코스가 없어요')).toBeVisible()
})

test('게스트의 저장은 서버로 보내지 않는다', async ({ page }) => {
  const sent: string[] = []
  page.on('request', (r) => { if (r.url().startsWith(`${API}/me/`)) sent.push(`${r.method()} ${r.url()}`) })

  await openCourse(page)
  await heart(page).click()
  await expect(heart(page)).toHaveAttribute('aria-pressed', 'true')
  await heart(page).click()
  await expect(heart(page)).toHaveAttribute('aria-pressed', 'false')

  expect(sent).toEqual([])
})
