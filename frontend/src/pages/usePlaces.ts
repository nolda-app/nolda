// 장소 목록(Supabase) — 처음 한 번 받아 두고 여러 화면이 같이 쓴다 (geo.ts가 캐시)
import { useEffect, useState } from 'react'
import { allPlaces, loadPlaces } from '../planner/geo'
import type { Place } from '../planner/geo'

const WAKING_MS = 2500
const RETRY_MS = 3000
const MAX_TRIES = 30 // 3초 간격 × 30회 ≈ 90초 — 서버가 깨어나는 50초보다 넉넉하게

// retry: 무료 서버는 잠들어 있다가 첫 요청에 50초쯤 걸려 깨어난다 — 홈에서는 포기하지 않고 계속 다시 시도한다
export function usePlaces({ retry = false }: { retry?: boolean } = {}) {
  const [places, setPlaces] = useState<Place[]>(() => allPlaces())
  const [failed, setFailed] = useState(false)
  const [waking, setWaking] = useState(false)
  useEffect(() => {
    let alive = true
    let timer = 0
    let warm = 0
    let tries = 0
    const attempt = () => {
      loadPlaces()
        .then(() => { if (alive) { setPlaces(allPlaces()); setFailed(false) } })
        .catch(() => {
          if (!alive) return
          if (!retry || ++tries >= MAX_TRIES) { setFailed(true); return }
          timer = window.setTimeout(attempt, RETRY_MS)
        })
    }
    attempt()
    // 2.5초가 지나도 못 받았으면 서버가 깨어나는 중이라고 알려준다
    if (retry) warm = window.setTimeout(() => { if (alive) setWaking(true) }, WAKING_MS)
    return () => { alive = false; clearTimeout(timer); clearTimeout(warm) }
  }, [retry])
  return { places, failed, waking, ready: places.length > 0 }
}
