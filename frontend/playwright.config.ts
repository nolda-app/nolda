import { defineConfig, devices } from '@playwright/test'

const PORT = 5174 // 개발 서버(5173)와 겹치지 않게
export const API = 'http://api.e2e.test' // 실제 서버 대신 각 테스트가 page.route로 가로챈다

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    env: { VITE_API_BASE_URL: API },
  },
})
