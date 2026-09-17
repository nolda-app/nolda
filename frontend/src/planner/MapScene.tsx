// 취향 분석 지도 장면 — 흐린 마포 지도 위로 기록(영상·사진)이 떨어지고, 떨어진 동네에 불빛이 모여 취향 지도가 완성됨
// phase: select(데이터 고르기) → launch(지도가 켜짐) → analyze(기록이 떨어짐) → done(동네가 이어지고 핀)
import type { CSSProperties, ReactNode } from 'react'

export type MapPhase = 'select' | 'launch' | 'analyze' | 'done'

// 동네 기준점(backend places.AREA_CENTERS)을 화면 비율(%)로 옮긴 위치
export const MAP_AREAS = [
  { name: '상암', x: 22, y: 27 },
  { name: '연남', x: 77, y: 38 },
  { name: '망원', x: 44, y: 50 },
  { name: '홍대', x: 70, y: 54 },
  { name: '합정', x: 55, y: 66 },
  { name: '상수', x: 76, y: 70 },
] as const

export interface MapDrop {
  key: string
  area: number // MAP_AREAS 인덱스
  label?: string // 유튜브 영상 제목·채널
  img?: string // 사진
}

/** 기록 → 떨어질 동네 (같은 기록은 항상 같은 동네로. 실제 방문 위치가 아니라 장면 연출용) */
export function dropArea(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h % MAP_AREAS.length
}

export default function MapScene({ phase, drops, children, top }: {
  phase: MapPhase
  drops: MapDrop[] // 지금까지 읽은 기록
  children: ReactNode // 아래 카드 내용
  top?: ReactNode // 위 버튼 줄
}) {
  const counts = MAP_AREAS.map((_, i) => drops.filter((d) => d.area === i).length)
  const lit = MAP_AREAS.map((a, i) => ({ ...a, i, n: counts[i] })).filter((a) => a.n > 0)
  // 완료 때 이을 동네: 기록이 많이 모인 순서로 최대 4곳, 위→아래로 이어 자연스러운 경로
  const route = [...lit].sort((a, b) => b.n - a.n).slice(0, 4).sort((a, b) => a.y - b.y)
  const recent = drops.slice(-6) // 떨어지는 중인 칩은 최근 것만 그림

  return (
    <div className={`ms ms--${phase}`}>
      <div className="ms-map" aria-hidden="true">
        <MapArt />
        {MAP_AREAS.map((a, i) => (
          <div key={a.name} className={'ms-area' + (counts[i] ? ' is-lit' : '')} style={{ left: `${a.x}%`, top: `${a.y}%` }}>
            <i className="ms-glow" style={{ '--n': Math.min(counts[i], 8) } as CSSProperties} />
            <span className="ms-area-name">{a.name}</span>
          </div>
        ))}
        {recent.map((d, i) => {
          const a = MAP_AREAS[d.area]
          return (
            <div key={d.key} className={'ms-drop' + (d.img ? ' ms-drop--photo' : '')} style={{ left: `${a.x}%`, top: `${a.y}%`, '--tilt': `${(i % 2 ? 1 : -1) * (4 + (i % 3) * 3)}deg` } as CSSProperties}>
              {d.img ? <img src={d.img} alt="" /> : <span>{d.label}</span>}
            </div>
          )
        })}
        {phase === 'done' && route.length > 1 && (
          <svg className="ms-route" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points={route.map((a) => `${a.x},${a.y}`).join(' ')} pathLength={1} />
          </svg>
        )}
        {phase === 'done' && route.map((a, i) => (
          <div key={a.name} className="ms-pin" style={{ left: `${a.x}%`, top: `${a.y}%`, animationDelay: `${0.5 + i * 0.18}s` }}>
            <b>{i + 1}</b>
          </div>
        ))}
      </div>
      {top && <div className="ms-top">{top}</div>}
      <div className="ms-card">{children}</div>
    </div>
  )
}

/** 마포를 단순하게 그린 지도 — 한강·공원·경의선숲길·큰길 */
function MapArt() {
  return (
    <svg className="ms-art" viewBox="0 0 100 100" preserveAspectRatio="none">
      <rect width="100" height="100" fill="#F1EEE6" />
      {/* 블록 */}
      <g fill="#E8E4D9">
        <rect x="30" y="8" width="16" height="10" rx="1.5" /><rect x="52" y="12" width="14" height="12" rx="1.5" />
        <rect x="84" y="20" width="14" height="12" rx="1.5" /><rect x="60" y="30" width="10" height="9" rx="1.5" />
        <rect x="26" y="40" width="10" height="8" rx="1.5" /><rect x="82" y="44" width="16" height="8" rx="1.5" />
        <rect x="36" y="58" width="12" height="7" rx="1.5" /><rect x="86" y="58" width="12" height="9" rx="1.5" />
      </g>
      {/* 공원 (하늘·노을공원, 월드컵공원, 망원 한강공원) */}
      <g fill="#DCE9CF">
        <path d="M2 38 Q14 34 26 40 Q30 50 22 58 Q10 62 2 56 Z" />
        <ellipse cx="34" cy="22" rx="7" ry="5" />
        <path d="M30 76 Q46 72 58 78 L56 82 Q42 80 30 82 Z" />
      </g>
      {/* 한강 */}
      <path d="M0 68 Q30 74 55 84 Q78 92 100 90 L100 100 L0 100 Z" fill="#CFE2EC" />
      <path d="M0 68 Q30 74 55 84 Q78 92 100 90" fill="none" stroke="#BFD6E2" strokeWidth=".6" />
      {/* 큰길 */}
      <g fill="none" stroke="#FFFFFF" strokeLinecap="round">
        <path d="M0 30 Q40 34 100 26" strokeWidth="1.6" />
        <path d="M8 62 Q50 56 100 48" strokeWidth="1.8" />
        <path d="M48 0 Q52 40 62 100" strokeWidth="1.4" />
        <path d="M88 0 Q80 50 90 100" strokeWidth="1.2" />
        <path d="M18 0 Q24 30 14 70" strokeWidth="1" />
      </g>
      {/* 경의선숲길 */}
      <path d="M90 18 Q80 36 72 50 Q64 62 56 70" fill="none" stroke="#B9D7A8" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="0.1 2.2" />
    </svg>
  )
}
