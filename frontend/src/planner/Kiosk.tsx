// 취향 분석 키오스크 장면 — 따뜻한 방 안의 키오스크, 원숭이가 카드를 꽂으면 화면에서 분석이 진행됨
// view: select(데이터 고르기) → insert(카드 꽂는 중) → analyze(분석 중) → done(분석 완료). 카메라가 장면마다 다가감
import type { ReactNode } from 'react'

export type KioskView = 'select' | 'insert' | 'analyze' | 'done'

export default function Kiosk({ view, children, onCardTap, cardHint }: {
  view: KioskView
  children: ReactNode // 키오스크 화면 안 내용
  onCardTap?: () => void // select에서 카드를 누르면
  cardHint?: boolean // 카드 쪽으로 눈길 주기 (고를 게 골라졌을 때)
}) {
  const cardInSlot = view === 'analyze' || view === 'done'
  return (
    <div className={`ks ks--${view}`}>
      {/* 뒤 배경 — 초점 밖이라 흐림 */}
      <div className="ks-bg" aria-hidden="true">
        <div className="ks-window"><i /><i /></div>
        <div className="ks-frame ks-frame--a" />
        <div className="ks-frame ks-frame--b" />
        <div className="ks-shelf" />
        <Leaves className="ks-plant-back" />
      </div>
      <div className="ks-sun" aria-hidden="true" />

      <div className="ks-camera">
        <div className="ks-desk" aria-hidden="true" />
        <div className="ks-kiosk">
          <div className="ks-body">
            <div className="ks-screen">
              <div className="ks-screen-in">{children}</div>
            </div>
            <div className="ks-panel">
              <div className="ks-badge"><MonkeyFace size={30} /></div>
              <div className="ks-reader">
                <div className="ks-slot" />
                <i className="ks-led" />
                {view === 'insert' && (
                  <>
                    <div className="ks-card ks-card--in"><CardFace /></div>
                    <svg className="ks-paw" viewBox="0 0 120 120" aria-hidden="true">
                      <ellipse cx="78" cy="96" rx="44" ry="30" fill="url(#ks-fur)" />
                      <ellipse cx="52" cy="46" rx="30" ry="26" fill="url(#ks-fur)" />
                      <ellipse cx="46" cy="44" rx="15" ry="12" fill="#e7b79a" opacity=".55" />
                    </svg>
                  </>
                )}
                {cardInSlot && <div className="ks-card-stub" />}
              </div>
            </div>
          </div>
        </div>
        {view === 'select' && (
          <>
            <div className="ks-card-label" aria-hidden="true">카드를 클릭해주세요</div>
            <button className={'ks-card ks-card--desk' + (cardHint ? ' is-hint' : '')} onClick={onCardTap} aria-label="카드를 꽂아 분석 시작">
              <CardFace />
            </button>
          </>
        )}
      </div>

      {/* 앞쪽 — 원숭이 뒷모습과 흐린 잎 */}
      <MonkeyBack />
      <Leaves className="ks-plant-front" />
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <radialGradient id="ks-fur" cx="38%" cy="32%" r="75%">
            <stop offset="0" stopColor="#b07a4c" />
            <stop offset=".6" stopColor="#8a5732" />
            <stop offset="1" stopColor="#6a3f22" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  )
}

/** 원숭이 뒷머리 + 귀 (화면 왼쪽 아래) */
function MonkeyBack() {
  return (
    <svg className="ks-monkey" viewBox="0 0 220 240" aria-hidden="true">
      <ellipse cx="96" cy="250" rx="120" ry="64" fill="url(#ks-fur)" />
      <circle cx="96" cy="128" r="92" fill="url(#ks-fur)" />
      <circle cx="186" cy="132" r="27" fill="#8a5732" />
      <circle cx="189" cy="132" r="16" fill="#e9b99a" />
      <path d="M74 42 Q92 12 118 34 Q100 28 90 44 Z" fill="#6f4426" />
      <path d="M40 90 Q60 70 84 72 M30 130 Q48 112 70 114" stroke="#c28b5c" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".25" />
    </svg>
  )
}

function Leaves({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 200 260" aria-hidden="true">
      <path d="M100 260 C96 200 90 150 70 90" stroke="#6f8f5a" strokeWidth="5" fill="none" />
      <ellipse cx="60" cy="80" rx="34" ry="58" fill="#8fb37a" transform="rotate(-28 60 80)" />
      <ellipse cx="130" cy="120" rx="30" ry="54" fill="#a3c48d" transform="rotate(32 130 120)" />
      <ellipse cx="54" cy="176" rx="28" ry="48" fill="#7ea56a" transform="rotate(-55 54 176)" />
      <ellipse cx="140" cy="200" rx="26" ry="44" fill="#96ba80" transform="rotate(50 140 200)" />
    </svg>
  )
}

/** 원숭이 얼굴 — 화면 속 캐릭터 (mood: 기본·눈 감고 웃음) */
export function MonkeyFace({ size = 80, happy = false }: { size?: number; happy?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="16" cy="52" r="13" fill="#9a6338" /><circle cx="17" cy="52" r="8" fill="#f2c9ad" />
      <circle cx="84" cy="52" r="13" fill="#9a6338" /><circle cx="83" cy="52" r="8" fill="#f2c9ad" />
      <circle cx="50" cy="50" r="36" fill="#9a6338" />
      <path d="M50 16 Q54 6 62 10 Q56 12 55 18 Z" fill="#7d4c2a" />
      <path d="M38 32 Q50 27 62 32 Q76 32 76 48 Q80 58 72 70 Q50 84 28 70 Q20 58 24 48 Q24 32 38 32 Z" fill="#f6dcc6" />
      {happy ? (
        <>
          <path d="M34 51 Q39 46 44 51" stroke="#3d2718" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d="M56 51 Q61 46 66 51" stroke="#3d2718" strokeWidth="3" strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <circle cx="39" cy="50" r="4" fill="#3d2718" /><circle cx="40.3" cy="48.6" r="1.2" fill="#fff" />
          <circle cx="61" cy="50" r="4" fill="#3d2718" /><circle cx="62.3" cy="48.6" r="1.2" fill="#fff" />
        </>
      )}
      <ellipse cx="30" cy="61" rx="6" ry="3.5" fill="#f19a8c" opacity=".55" />
      <ellipse cx="70" cy="61" rx="6" ry="3.5" fill="#f19a8c" opacity=".55" />
      <path d="M44 62 Q50 68 56 62" stroke="#3d2718" strokeWidth="2.6" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function CardFace() {
  return (
    <>
      <span className="ks-card-face"><MonkeyFace size={26} /></span>
      <span className="ks-card-lines"><i /><i /></span>
    </>
  )
}

export function YoutubeIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="3" y="8" width="34" height="24" rx="7" fill="#ee6b64" />
      <path d="M17 14 L26 20 L17 26 Z" fill="#fff" />
    </svg>
  )
}

export function PhotoIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="4" y="6" width="32" height="28" rx="6" fill="#bcd7e6" />
      <circle cx="14" cy="15" r="3.5" fill="#f4cf6e" />
      <path d="M4 30 L15 19 L22 26 L27 21 L36 30 V28 Q36 34 30 34 H10 Q4 34 4 28 Z" fill="#8bb885" />
    </svg>
  )
}

export function HeartIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      <path d="M15 26 C4 18 3 12 6 8 C9 4 14 6 15 9 C16 6 21 4 24 8 C27 12 26 18 15 26 Z" fill="#ee8b8b" />
    </svg>
  )
}

export function MusicIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <path d="M10 19 V6 L21 4 V16" stroke="#ee8b8b" strokeWidth="2.4" fill="none" strokeLinejoin="round" />
      <circle cx="7.5" cy="19" r="3" fill="#ee8b8b" /><circle cx="18.5" cy="16.5" r="3" fill="#ee8b8b" />
    </svg>
  )
}
