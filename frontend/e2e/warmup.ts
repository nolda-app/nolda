import { chromium } from '@playwright/test'

// 개발 서버는 처음 열린 화면의 모듈을 그때 변환한다. 테스트들이 동시에 첫 화면을 열면 로딩이 30초를 넘겨 간헐적으로 실패하므로,
// 테스트를 시작하기 전에 앱을 한 번 열어 미리 변환해 둔다. (백엔드·개발 서버는 이미 떠 있다)
export default async function warmup() {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort())
    await page.addInitScript(() => sessionStorage.setItem('nolda:splashed', '1'))
    for (const path of ['/', '/start', '/courses']) await page.goto(`http://localhost:5174${path}`, { waitUntil: 'load', timeout: 120_000 })
  } finally {
    await browser.close()
  }
}
