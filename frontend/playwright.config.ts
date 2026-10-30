import { defineConfig, devices } from '@playwright/test'

const FRONT_PORT = 5174 // 개발 서버(5173)와 겹치지 않게
const API_PORT = 8765
export const API = `http://localhost:${API_PORT}`

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/warmup.ts',
  fullyParallel: true,
  workers: 3, // 개발 서버가 처음 변환하는 동안 동시에 많이 열면 첫 화면 로딩이 30초를 넘겨 실패한다
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${FRONT_PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Pixel 7'] } }],
  webServer: [
    {
      // 실제 백엔드. 구글 키는 형식만 맞는 가짜 값 — 인가 주소를 만들 뿐 구글에 요청하지 않는다
      command: `uv run uvicorn main:app --port ${API_PORT}`,
      cwd: '../backend',
      url: `${API}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        GOOGLE_CLIENT_ID: 'e2e-client',
        GOOGLE_CLIENT_SECRET: 'e2e-secret',
        GOOGLE_REDIRECT_URI: `${API}/auth/youtube/callback`,
        GOOGLE_LOGIN_REDIRECT_URI: `${API}/auth/login/google/callback`,
        KAKAO_CLIENT_ID: 'e2e-kakao',
        KAKAO_REDIRECT_URI: `${API}/auth/login/kakao/callback`,
        FRONTEND_URL: `http://localhost:${FRONT_PORT}`,
        CORS_ORIGINS: `http://localhost:${FRONT_PORT}`,
        // backend/.env의 운영 키가 읽히지 않게 빈 값으로 덮는다 — 실수로 DB·OpenAI를 부르는 일을 막는다 (.env는 이미 있는 값을 덮어쓰지 않는다)
        SUPABASE_URL: '',
        SUPABASE_KEY: '',
        OPENAI_API_KEY: '',
      },
    },
    {
      command: `npx vite --port ${FRONT_PORT} --strictPort`,
      url: `http://localhost:${FRONT_PORT}`,
      reuseExistingServer: false,
      env: { VITE_API_BASE_URL: API },
    },
  ],
})
