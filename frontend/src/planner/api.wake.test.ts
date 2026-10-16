import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// BASE는 모듈이 불러와질 때 환경변수에서 한 번 읽으므로, 케이스마다 모듈을 새로 불러온다
async function loadWake(base: string) {
  vi.resetModules()
  vi.stubEnv('VITE_API_BASE_URL', base)
  return (await import('./api')).wakeServer
}

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset().mockResolvedValue(new Response()); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('wakeServer', () => {
  it('/health를 no-cors, no-store로 호출한다', async () => {
    const wakeServer = await loadWake('https://api.example.com')
    wakeServer()
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/health', { mode: 'no-cors', cache: 'no-store' })
  })

  it('주소 끝의 슬래시는 중복 없이 붙인다', async () => {
    const wakeServer = await loadWake('https://api.example.com/')
    wakeServer()
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/health')
  })

  it('API 주소가 설정되지 않았으면 아무것도 호출하지 않는다', async () => {
    const wakeServer = await loadWake('')
    wakeServer()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('요청이 실패해도 예외가 나지 않는다', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    const wakeServer = await loadWake('https://api.example.com')
    expect(() => wakeServer()).not.toThrow()
    // 거부가 처리되지 않으면 vitest가 unhandled rejection으로 실패시킨다
    await new Promise((r) => setTimeout(r, 0))
  })
})
