// 장소 목록(Supabase) — 처음 한 번 받아 두고 여러 화면이 같이 쓴다 (geo.ts가 캐시)
import { useEffect, useState } from 'react'
import { allPlaces, loadPlaces } from '../planner/geo'
import type { Place } from '../planner/geo'

export function usePlaces() {
  const [places, setPlaces] = useState<Place[]>(() => allPlaces())
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    loadPlaces()
      .then(() => { if (alive) setPlaces(allPlaces()) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])
  return { places, failed, ready: places.length > 0 }
}
