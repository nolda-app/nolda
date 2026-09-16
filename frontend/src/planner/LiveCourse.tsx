// 코스 시작 — 큰 지도에 내 실시간 위치·이동 순서를 보여주고, 장소에 도착할 때마다 다음 목적지로 넘김
import { useEffect, useMemo, useState } from 'react'
import NaverMap from './NaverMap'
import type { LatLng } from './NaverMap'
import KindThumb from './KindThumb'
import { placeGeo } from './geo'
import { WALK_PATHS } from './routes'
import type { BuiltCourse } from './logic'

const GREEN = '#00A46E'
const NEAR_M = 60 // 이 거리 안이면 '근처에 도착' 표시
const WALK_M_PER_MIN = 75
const LIVE_FIT_PADDING = { top: 90, right: 40, bottom: 300, left: 40 } // 위 버튼·아래 패널에 핀이 가리지 않게

function meters(a: LatLng, b: LatLng) {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(h))
}
const distText = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m / 10) * 10}m`)

type GeoState = { status: 'wait' } | { status: 'ok'; pos: LatLng; acc: number } | { status: 'error'; msg: string }

function useMyLocation(): GeoState {
  const [geo, setGeo] = useState<GeoState>(() =>
    !window.isSecureContext || !navigator.geolocation
      ? { status: 'error', msg: '이 주소에서는 위치를 쓸 수 없어요 (https 또는 localhost 필요)' }
      : { status: 'wait' })
  useEffect(() => {
    if (!window.isSecureContext || !navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      (p) => setGeo({ status: 'ok', pos: { lat: p.coords.latitude, lng: p.coords.longitude }, acc: p.coords.accuracy }),
      (e) => setGeo({ status: 'error', msg: e.code === e.PERMISSION_DENIED ? '위치 권한이 꺼져 있어요 · 브라우저 설정에서 허용해 주세요' : '내 위치를 가져오지 못했어요' }),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])
  return geo
}

export default function LiveCourse({ course, isSaved, toggleSave, onClose }: {
  course: BuiltCourse
  isSaved: boolean
  toggleSave: () => void
  onClose: () => void
}) {
  const [arrived, setArrived] = useState(0) // 도착한 장소 수 = 다음 목적지 index
  const [focus, setFocus] = useState<LatLng | null>(null)
  const geo = useMyLocation()
  const me = geo.status === 'ok' ? geo.pos : null

  const places = useMemo(() => course.items.map((it) => placeGeo(it.pid)), [course.items])
  const markers = useMemo(
    () => course.items.flatMap((it, i) => {
      const g = places[i]
      return g ? [{ no: i + 1, name: it.name, time: it.time, lat: g[0], lng: g[1] }] : []
    }),
    [course.items, places],
  )
  const allPinned = markers.length === course.items.length

  const total = course.items.length
  const finished = arrived >= total
  const next = finished ? null : course.items[arrived]
  const nextGeo = finished ? undefined : places[arrived]
  const dist = me && nextGeo ? meters(me, { lat: nextGeo[0], lng: nextGeo[1] }) : null
  const near = dist !== null && dist <= NEAR_M

  // 다음 목적지가 바뀌면 그쪽으로 지도 이동
  useEffect(() => {
    if (nextGeo) setFocus({ lat: nextGeo[0], lng: nextGeo[1] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrived])

  const locLine = geo.status === 'error'
    ? geo.msg
    : dist === null
      ? '내 위치 확인 중…'
      : near ? '근처에 도착했어요' : `여기서 ${distText(dist)} · 도보 약 ${Math.max(1, Math.round(dist / WALK_M_PER_MIN))}분`

  return (
    <div className="pl-live" role="dialog" aria-label={`${course.title} 코스 진행`}>
      <NaverMap
        className="pl-livemap" markers={markers} color={GREEN} arrived={allPinned ? arrived : undefined}
        paths={allPinned ? WALK_PATHS[course.id] : undefined} me={me} focus={focus}
        fitPadding={LIVE_FIT_PADDING}
      />

      <div className="pl-live-top">
        <button type="button" className="pl-live-btn" onClick={onClose}>✕ 종료</button>
        <div className="pl-live-title">{course.title}</div>
        <button type="button" className="pl-live-btn pl-live-heart" aria-pressed={isSaved} aria-label={isSaved ? '저장 취소' : '저장'} onClick={toggleSave}>
          {isSaved ? '♥' : '♡'}
        </button>
      </div>
      <button type="button" className="pl-live-btn pl-live-locate" disabled={!me} onClick={() => me && setFocus({ ...me })}>
        ◎ 내 위치
      </button>

      <div className="pl-live-sheet">
        <div className="pl-live-steps" aria-label="이동 순서">
          {course.items.map((it, i) => (
            <button
              type="button" key={i} onClick={() => setArrived(i)}
              className={'pl-live-step' + (i < arrived ? ' done' : i === arrived ? ' next' : '')}
              aria-current={i === arrived ? 'step' : undefined}
            >
              <span className="pl-live-stepno">{i < arrived ? '✓' : i + 1}</span>
              <span className="pl-live-stepname">{it.name}</span>
            </button>
          ))}
        </div>

        {next ? (
          <div className="pl-live-card">
            <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <KindThumb kind={next.kind} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="pl-live-eyebrow">
                  {arrived === 0 ? '첫 목적지' : '다음 목적지'} {arrived + 1}/{total} · {next.time} 도착 예정
                </div>
                <div className="pl-live-name">{next.name}</div>
                <div className="pl-live-meta" style={{ color: near ? GREEN : geo.status === 'error' ? '#C0492F' : undefined }}>{locLine}</div>
              </div>
            </div>
            {next.hasMove && <div className="pl-live-move">이전 장소에서 {next.moveLabel}{next.moveDetail ? ` · ${next.moveDetail}` : ''}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {arrived > 0 && <button type="button" className="pl-live-sub" onClick={() => setArrived((n) => n - 1)}>이전</button>}
              <button type="button" className="pl-cta" style={{ flex: 1, margin: 0, border: 0 }} onClick={() => setArrived((n) => n + 1)}>
                {near ? '도착 확인' : '도착했어요'}
              </button>
            </div>
          </div>
        ) : (
          <div className="pl-live-card" style={{ textAlign: 'center' }}>
            <div className="pl-live-name">코스를 모두 돌았어요</div>
            <div className="pl-live-meta">{course.dur} · {total}곳</div>
            <button type="button" className="pl-cta" style={{ width: '100%', marginTop: 14, border: 0 }} onClick={onClose}>코스 종료</button>
          </div>
        )}
        {!allPinned && <div className="pl-live-meta" style={{ marginTop: 8 }}>일부 장소는 좌표가 없어 지도에 핀이 빠졌어요</div>}
      </div>
    </div>
  )
}
