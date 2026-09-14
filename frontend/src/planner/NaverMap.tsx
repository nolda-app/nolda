import { useEffect, useRef, useState } from 'react'

const KEY = import.meta.env.VITE_NAVER_MAP_CLIENT_ID as string | undefined
const SRC = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${KEY}`

let loading: Promise<void> | null = null

function loadNaver(): Promise<void> {
  if ((window as any).naver?.maps) return Promise.resolve()
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('naver maps script load failed'))
    document.head.appendChild(s)
  })
  return loading
}

export interface MapMarker { no: number; name: string; time: string; lat: number; lng: number }
export interface LatLng { lat: number; lng: number }

const GREY = '#A7ADB6'

function markerHtml(m: MapMarker, color: string, state: 'done' | 'next' | 'todo' | 'plain') {
  const bg = state === 'done' ? GREY : color
  const size = state === 'next' ? 32 : 24
  const ring = state === 'next' ? `box-shadow:0 0 0 6px ${color}33,0 3px 10px rgba(0,120,80,.35);` : 'box-shadow:0 3px 10px rgba(0,120,80,.35);'
  const label = state === 'done' ? '✓' : String(m.no)
  return (
    `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;transform:translate(-50%,-100%)">` +
    `<div style="padding:5px 9px;border-radius:99px;background:#fff;box-shadow:0 3px 10px rgba(20,24,33,.16);font:700 10.5px/1 Pretendard,sans-serif;color:${state === 'done' ? GREY : '#141821'};white-space:nowrap">${m.time} ${m.name}</div>` +
    `<div style="width:${size}px;height:${size}px;border-radius:99px;background:${bg};border:2.5px solid #fff;${ring}color:#fff;font:700 ${state === 'next' ? 13 : 11}px/${size - 5}px Pretendard,sans-serif;text-align:center">${label}</div>` +
    `</div>`
  )
}

/**
 * paths: 구간별 실제 도보 경로 [위도, 경도][] — 없으면 장소끼리 직선 점선
 * arrived: 코스 진행 중이면 도착한 장소 수 (그만큼 회색 ✓, 다음 목적지는 크게). 없으면 일반 표시
 * me: 내 현재 위치 (파란 점) · focus: 바뀔 때마다 그 좌표로 지도 이동
 * fitPadding: 처음 코스 전체를 맞출 때 가장자리 여백 (지도 위에 패널이 덮이면 그만큼 크게)
 */
const FIT_PADDING = { top: 48, right: 32, bottom: 32, left: 32 }

export default function NaverMap({ markers, color, paths, arrived, me, focus, className = 'pl-routemap', fitPadding = FIT_PADDING }: {
  markers: MapMarker[]
  color: string
  paths?: [number, number][][]
  arrived?: number
  me?: LatLng | null
  focus?: LatLng | null
  className?: string
  fitPadding?: typeof FIT_PADDING
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<any>(null)
  const [err, setErr] = useState<string | null>(KEY ? null : 'VITE_NAVER_MAP_CLIENT_ID 없음')

  // 지도 + 경로선 (코스가 바뀔 때만 다시 그림)
  useEffect(() => {
    if (!KEY || !ref.current || !markers.length) return
    let m: any = null
    let dead = false

    loadNaver().then(() => {
      if (dead || !ref.current) return
      const nv = (window as any).naver
      const pts = markers.map((mk) => new nv.maps.LatLng(mk.lat, mk.lng))

      m = new nv.maps.Map(ref.current, {
        center: pts[0],
        zoom: 15,
        scaleControl: false,
        mapDataControl: false,
        logoControlOptions: { position: nv.maps.Position.BOTTOM_LEFT },
      })

      const walk: any[][] | null = paths && paths.length === pts.length - 1
        ? paths.map((seg) => seg.map(([lat, lng]) => new nv.maps.LatLng(lat, lng)))
        : null

      if (walk) {
        walk.forEach((path) => new nv.maps.Polyline({
          map: m, path, strokeColor: color, strokeWeight: 4, strokeOpacity: 0.9,
          strokeLineCap: 'round', strokeLineJoin: 'round',
        }))
      } else {
        new nv.maps.Polyline({
          map: m, path: pts, strokeColor: color, strokeWeight: 3,
          strokeStyle: 'shortdash', strokeOpacity: 0.9,
        })
      }

      // 코스 전체(도보 경로 포함)가 보이도록 화면 맞춤
      const b = new nv.maps.LatLngBounds(pts[0], pts[0])
      pts.concat(walk ? walk.flat() : []).forEach((p: any) => b.extend(p))
      m.fitBounds(b, fitPadding)
      setMap(m)
    }).catch((e) => { console.error('[NaverMap]', e); if (!dead) setErr('지도를 불러오지 못했어요') })

    return () => { dead = true; setMap(null); m?.destroy?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, color, paths])

  // 장소 핀 — 진행 상태(arrived)가 바뀌면 다시 그림
  useEffect(() => {
    if (!map) return
    const nv = (window as any).naver
    const pins = markers.map((mk, i) => new nv.maps.Marker({
      map, position: new nv.maps.LatLng(mk.lat, mk.lng), zIndex: arrived === i ? 50 : 10,
      icon: { content: markerHtml(mk, color, arrived === undefined ? 'plain' : i < arrived ? 'done' : i === arrived ? 'next' : 'todo') },
    }))
    return () => pins.forEach((p) => p.setMap(null))
  }, [map, markers, color, arrived])

  // 내 위치 점
  useEffect(() => {
    if (!map || !me) return
    const nv = (window as any).naver
    const dot = new nv.maps.Marker({
      map, position: new nv.maps.LatLng(me.lat, me.lng), zIndex: 100,
      icon: {
        content: '<div style="width:18px;height:18px;border-radius:99px;background:#2F80ED;border:3px solid #fff;box-shadow:0 0 0 8px rgba(47,128,237,.2),0 2px 6px rgba(20,24,33,.3);transform:translate(-50%,-50%)"></div>',
      },
    })
    return () => dot.setMap(null)
  }, [map, me])

  useEffect(() => {
    if (!map || !focus) return
    map.panTo(new (window as any).naver.maps.LatLng(focus.lat, focus.lng))
  }, [map, focus])

  if (err) return <div className={`${className} pl-routemap-fallback`}>{err}</div>
  if (!markers.length) return <div className={`${className} pl-routemap-fallback`}>실제 장소 연결 전이라 지도가 없어요</div>
  return <div ref={ref} className={className} />
}
