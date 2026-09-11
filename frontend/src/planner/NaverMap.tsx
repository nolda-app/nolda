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

/** paths: 구간별 실제 도보 경로 [위도, 경도][] — 없으면 장소끼리 직선 점선 */
export default function NaverMap({ markers, color, paths }: { markers: MapMarker[]; color: string; paths?: [number, number][][] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState<string | null>(KEY ? null : 'VITE_NAVER_MAP_CLIENT_ID 없음')

  useEffect(() => {
    if (!KEY || !ref.current || !markers.length) return
    let map: any = null
    let dead = false

    loadNaver().then(() => {
      if (dead || !ref.current) return
      const nv = (window as any).naver
      const pts = markers.map((m) => new nv.maps.LatLng(m.lat, m.lng))

      map = new nv.maps.Map(ref.current, {
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
          map, path, strokeColor: color, strokeWeight: 4, strokeOpacity: 0.9,
          strokeLineCap: 'round', strokeLineJoin: 'round',
        }))
      } else {
        new nv.maps.Polyline({
          map, path: pts, strokeColor: color, strokeWeight: 3,
          strokeStyle: 'shortdash', strokeOpacity: 0.9,
        })
      }

      markers.forEach((m, i) => {
        new nv.maps.Marker({
          map, position: pts[i],
          icon: {
            content:
              `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;transform:translate(-50%,-100%)">` +
              `<div style="padding:5px 9px;border-radius:99px;background:#fff;box-shadow:0 3px 10px rgba(20,24,33,.16);font:700 10.5px/1 Pretendard,sans-serif;color:#141821;white-space:nowrap">${m.time} ${m.name}</div>` +
              `<div style="width:24px;height:24px;border-radius:99px;background:${color};border:2.5px solid #fff;box-shadow:0 3px 10px rgba(0,120,80,.35);color:#fff;font:700 11px/19px Pretendard,sans-serif;text-align:center">${m.no}</div>` +
              `</div>`,
          },
        })
      })

      // 코스 전체(도보 경로 포함)가 보이도록 화면 맞춤
      const b = new nv.maps.LatLngBounds(pts[0], pts[0])
      pts.concat(walk ? walk.flat() : []).forEach((p: any) => b.extend(p))
      map.fitBounds(b, { top: 48, right: 32, bottom: 32, left: 32 })
    }).catch((e) => { console.error('[NaverMap]', e); if (!dead) setErr('지도를 불러오지 못했어요') })

    return () => { dead = true; map?.destroy?.() }
  }, [markers, color, paths])

  if (err) return <div className="pl-routemap pl-routemap-fallback">{err}</div>
  if (!markers.length) return <div className="pl-routemap pl-routemap-fallback">실제 장소 연결 전이라 지도가 없어요</div>
  return <div ref={ref} className="pl-routemap" />
}
