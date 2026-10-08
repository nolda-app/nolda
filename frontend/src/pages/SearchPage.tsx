// /search — 장소 검색. ?kind=카페 로 들어오면 그 종류 목록
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CategoryView, PlaceSheet, SearchView } from '../planner/HomeViews'
import type { Place } from '../planner/geo'
import { usePlaces } from './usePlaces'

export default function SearchPage() {
  const { places, failed } = usePlaces()
  const [params, setParams] = useSearchParams()
  const kind = params.get('kind')
  const setKind = (k: string | null) => setParams(k ? { kind: k } : {}, { replace: true })
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Place | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!kind) searchRef.current?.focus() }, [kind])

  return (
    <div className="pl-screen pl-screen-fixed">
      <div className="pl-vtitle">검색</div>
      <div className="pl-home-search">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="어디서 놀까요? 장소·동네 검색" aria-label="장소 검색" />
        {!!q && <button type="button" className="pl-home-clear" onClick={() => setQ('')} aria-label="검색어 지우기">✕</button>}
      </div>
      <div className="pl-scroll" style={{ padding: '0 0 104px' }}>
        {failed && <div className="pl-home-empty">장소를 불러오지 못했어요. 잠시 뒤 다시 열어주세요.</div>}
        {kind
          ? <CategoryView places={places} kind={kind} setKind={setKind} onPick={setPicked} />
          : <SearchView places={places} q={q} setQ={setQ} onPick={setPicked} />}
      </div>
      {picked && <PlaceSheet p={picked} onClose={() => setPicked(null)} />}
    </div>
  )
}
