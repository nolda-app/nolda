import { useEffect, useState } from 'react'
import { fetchWalkLegs } from './api'
import { WALK_PATHS } from './routes'

/** 코스 핀을 순서대로 이은 실제 도보 경로 (백엔드 → TMAP).
 *
 * 코스가 AI·DB로 매번 새로 만들어져서 미리 만들어둔 routes.ts에는 없는 ID가 대부분이다.
 * 그래서 실제 경로를 받아 쓰고, 못 받으면 routes.ts → 그것도 없으면 undefined(지도가 직선으로 그림) 순서로 떨어진다.
 */
export function useWalkLegs(
  courseId: string,
  markers: { lat: number; lng: number; name: string }[],
  ready: boolean,
): [number, number][][] | undefined {
  const [legs, setLegs] = useState<[number, number][][] | undefined>()
  const key = markers.map((m) => `${m.lat},${m.lng}`).join('|')

  useEffect(() => {
    setLegs(undefined)
    if (!ready || markers.length < 2) return
    const ac = new AbortController()
    fetchWalkLegs(markers.map((m) => [m.lat, m.lng]), markers.map((m) => m.name), ac.signal)
      .then(setLegs)
      .catch(() => { /* 실패하면 아래 폴백 */ })
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready])

  return legs ?? (ready ? WALK_PATHS[courseId] : undefined)
}
