import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { allPlaces, loadPlaces } from '../planner/geo'
import type { Place } from '../planner/geo'
import { usePlaces } from './usePlaces'

vi.mock('../planner/geo', () => ({ loadPlaces: vi.fn(), allPlaces: vi.fn(() => []) }))

const PLACE = { id: 'p1', name: '카페' } as Place
const RETRY_MS = 3000
const WAKING_MS = 2500
const MAX_TRIES = 30

// 대기 중인 타이머와 프라미스 콜백을 함께 흘려보낸다
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(loadPlaces).mockReset()
  vi.mocked(allPlaces).mockReset().mockReturnValue([])
})
afterEach(() => { vi.useRealTimers() })

describe('usePlaces', () => {
  describe('기본 (retry 없음)', () => {
    it('한 번 실패하면 바로 failed, 다시 시도하지 않는다', async () => {
      vi.mocked(loadPlaces).mockRejectedValue(new Error('down'))
      const { result } = renderHook(() => usePlaces())
      await tick(0)
      expect(result.current.failed).toBe(true)
      await tick(RETRY_MS * 3)
      expect(loadPlaces).toHaveBeenCalledTimes(1)
    })

    it('오래 걸려도 waking을 켜지 않는다', async () => {
      vi.mocked(loadPlaces).mockReturnValue(new Promise(() => {}))
      const { result } = renderHook(() => usePlaces())
      await tick(WAKING_MS * 2)
      expect(result.current.waking).toBe(false)
    })

    it('성공하면 places가 채워지고 ready가 된다', async () => {
      vi.mocked(loadPlaces).mockImplementation(async () => { vi.mocked(allPlaces).mockReturnValue([PLACE]) })
      const { result } = renderHook(() => usePlaces())
      expect(result.current.ready).toBe(false)
      await tick(0)
      expect(result.current.places).toEqual([PLACE])
      expect(result.current.ready).toBe(true)
      expect(result.current.failed).toBe(false)
    })
  })

  describe('retry: true', () => {
    it('실패해도 failed로 두지 않고 3초 뒤 다시 시도한다', async () => {
      vi.mocked(loadPlaces).mockRejectedValue(new Error('down'))
      const { result } = renderHook(() => usePlaces({ retry: true }))
      await tick(0)
      expect(loadPlaces).toHaveBeenCalledTimes(1)
      expect(result.current.failed).toBe(false)
      await tick(RETRY_MS - 1)
      expect(loadPlaces).toHaveBeenCalledTimes(1)
      await tick(1)
      expect(loadPlaces).toHaveBeenCalledTimes(2)
    })

    it('재시도 끝에 성공하면 places가 채워지고 failed가 아니다', async () => {
      vi.mocked(loadPlaces)
        .mockRejectedValueOnce(new Error('down'))
        .mockRejectedValueOnce(new Error('down'))
        .mockImplementation(async () => { vi.mocked(allPlaces).mockReturnValue([PLACE]) })
      const { result } = renderHook(() => usePlaces({ retry: true }))
      await tick(RETRY_MS * 2)
      expect(loadPlaces).toHaveBeenCalledTimes(3)
      expect(result.current.ready).toBe(true)
      expect(result.current.failed).toBe(false)
    })

    it(`${MAX_TRIES}번 모두 실패하면 failed가 되고 더는 시도하지 않는다`, async () => {
      vi.mocked(loadPlaces).mockRejectedValue(new Error('down'))
      const { result } = renderHook(() => usePlaces({ retry: true }))
      await tick(RETRY_MS * (MAX_TRIES - 2))
      expect(result.current.failed).toBe(false)
      await tick(RETRY_MS)
      expect(result.current.failed).toBe(true)
      expect(loadPlaces).toHaveBeenCalledTimes(MAX_TRIES)
      await tick(RETRY_MS * 5)
      expect(loadPlaces).toHaveBeenCalledTimes(MAX_TRIES)
    })

    it('2.5초가 지나도 못 받으면 waking이 켜진다', async () => {
      vi.mocked(loadPlaces).mockReturnValue(new Promise(() => {}))
      const { result } = renderHook(() => usePlaces({ retry: true }))
      await tick(WAKING_MS - 1)
      expect(result.current.waking).toBe(false)
      await tick(1)
      expect(result.current.waking).toBe(true)
    })

    it('언마운트하면 대기 중인 재시도와 waking 타이머가 정리된다', async () => {
      vi.mocked(loadPlaces).mockRejectedValue(new Error('down'))
      const { unmount } = renderHook(() => usePlaces({ retry: true }))
      await tick(0)
      unmount()
      await tick(RETRY_MS * 5)
      expect(loadPlaces).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
    })
  })
})
