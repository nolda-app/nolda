// 코스 공유 창 — 카카오톡(키 있을 때) · 문자 · 링크 복사 · 더보기(폰 기본 공유)
import { useEffect, useState } from 'react'
import { placeInfo } from './geo'
import { won } from './data'
import type { BuiltCourse } from './logic'

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined
const KAKAO_SDK = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js'

/** 공유 메시지 템플릿 — 문자·복사·더보기에서 같은 문장 */
export function shareMessage(c: BuiltCourse, url: string) {
  return [
    `[NOLDA] ${c.title}`,
    `📍 ${c.area} · ${c.span} · 1인 ${won(c.perPerson)}`,
    ...c.items.map((it, i) => `${i + 1}. ${it.time} ${it.name}`),
    ...(url ? ['', `👉 코스 보기 ${url}`] : []),
  ].join('\n')
}

let kakaoLoading: Promise<any> | null = null
function loadKakao(): Promise<any> {
  const w = window as any
  if (w.Kakao?.isInitialized?.()) return Promise.resolve(w.Kakao)
  kakaoLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = KAKAO_SDK
    s.onload = () => { w.Kakao.init(KAKAO_JS_KEY); resolve(w.Kakao) }
    s.onerror = () => { kakaoLoading = null; reject(new Error('카카오 SDK를 불러오지 못했어요')) }
    document.head.appendChild(s)
  })
  return kakaoLoading
}

/** 클립보드 복사 — Clipboard API가 막히면 예전 방식으로 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const el = document.createElement('textarea')
    el.value = text
    el.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    el.remove()
    return ok
  }
}

export default function ShareSheet({ course, url, onClose, toast }: {
  course: BuiltCourse
  url: string // 공유 링크 (DB에 저장 안 된 코스면 '')
  onClose: () => void
  toast: (msg: string) => void
}) {
  const message = shareMessage(course, url)
  const [kakaoReady, setKakaoReady] = useState(false)
  const mobile = window.matchMedia('(pointer: coarse)').matches
  const canNative = mobile && !!navigator.share

  useEffect(() => {
    if (KAKAO_JS_KEY && url) loadKakao().then(() => setKakaoReady(true)).catch(() => setKakaoReady(false))
  }, [url])

  const done = (msg?: string) => { if (msg) toast(msg); onClose() }

  const kakao = async () => {
    try {
      const Kakao = await loadKakao()
      // 가게 사진(img)은 사진 연동 브랜치가 합쳐졌을 때만 있음
      const img = course.items.map((it) => (placeInfo(it.pid) as { img?: string | null } | undefined)?.img).find(Boolean)
      Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: `[NOLDA] ${course.title}`,
          description: `${course.area} · ${course.span} · ${course.items.map((it) => it.name).join(' → ')}`,
          ...(img ? { imageUrl: img } : {}),
          link: { mobileWebUrl: url, webUrl: url },
        },
        buttons: [{ title: '코스 보기', link: { mobileWebUrl: url, webUrl: url } }],
      })
      done()
    } catch (e) {
      done(`카카오톡 공유를 열지 못했어요 · ${(e as Error).message}`)
    }
  }

  const sms = () => {
    // iOS는 sms:&body=, 안드로이드는 sms:?body=
    const sep = /iPhone|iPad|iPod/.test(navigator.userAgent) ? '&' : '?'
    window.location.href = `sms:${sep}body=${encodeURIComponent(message)}`
    done(mobile ? undefined : '문자 앱이 열리지 않으면 휴대폰에서 공유해 주세요')
  }

  const copy = async () => {
    const ok = await copyText(message)
    done(ok ? (url ? '공유 링크를 복사했어요' : '코스 내용을 복사했어요 · 링크는 코스가 저장되면 만들어져요') : '복사하지 못했어요. 다시 시도해 주세요')
  }

  const more = async () => {
    try {
      await navigator.share({ title: `NOLDA · ${course.title}`, text: message })
      done()
    } catch (e) {
      if ((e as Error).name !== 'AbortError') done('공유하지 못했어요')
    }
  }

  const options = [
    ...(KAKAO_JS_KEY && url ? [{ key: 'kakao', label: '카카오톡', icon: 'K', cls: 'kakao', on: kakao, disabled: !kakaoReady }] : []),
    { key: 'sms', label: '문자', icon: '✉', cls: 'sms', on: sms, disabled: false },
    { key: 'copy', label: url ? '링크 복사' : '내용 복사', icon: '🔗', cls: 'copy', on: copy, disabled: false },
    ...(canNative ? [{ key: 'more', label: '더보기', icon: '⋯', cls: 'more', on: more, disabled: false }] : []),
  ]

  return (
    <div className="pl-sheet-wrap pl-share-wrap" role="dialog" aria-label="코스 공유">
      <div className="pl-sheet-backdrop" onClick={onClose} />
      <div className="pl-sheet">
        <div className="pl-sheet-handle" />
        <div className="pl-h1" style={{ fontSize: 19 }}>코스 공유</div>
        <div className="pl-share-preview">{message}</div>
        <div className="pl-share-opts">
          {options.map((o) => (
            <button key={o.key} type="button" className="pl-share-opt" onClick={o.on} disabled={o.disabled}>
              <span className={`pl-share-icon pl-share-${o.cls}`} aria-hidden>{o.icon}</span>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
