import { afterEach, describe, expect, it } from 'vitest'
import { readEntry, saveReturnTo, takeReturnTo, savePending, takePending, safePath } from './entry'

afterEach(() => sessionStorage.clear())

describe('readEntry', () => {
  it('쿼리가 없으면 none', () => {
    expect(readEntry('')).toEqual({ kind: 'none' })
  })
  it('카카오·구글 로그인 성공', () => {
    expect(readEntry('?login_token=abc')).toEqual({ kind: 'login', token: 'abc' })
  })
  it('로그인 취소 코드는 한국어 안내로', () => {
    expect(readEntry('?login_error=cancelled')).toEqual({ kind: 'loginError', message: '카카오 로그인을 취소했어요.' })
    expect(readEntry('?login_error=access_denied')).toEqual({ kind: 'loginError', message: '카카오 로그인을 취소했어요.' })
  })
  it('백엔드가 보낸 에러 문장은 그대로', () => {
    expect(readEntry('?login_error=' + encodeURIComponent('토큰 교환 실패'))).toEqual({ kind: 'loginError', message: '토큰 교환 실패' })
  })
  it('유튜브 연동 성공·실패', () => {
    expect(readEntry('?yt=r1')).toEqual({ kind: 'youtube', id: 'r1' })
    expect(readEntry('?yt_error=access_denied')).toEqual({ kind: 'youtubeError', message: '유튜브 연결을 취소했어요' })
    expect(readEntry('?yt_error=boom')).toEqual({ kind: 'youtubeError', message: '유튜브 연결에 실패했어요' })
  })
  it('Object.prototype 키는 에러 문장으로 그대로', () => {
    expect(readEntry('?login_error=constructor')).toEqual({ kind: 'loginError', message: 'constructor' })
  })
  it('옛 공유 링크', () => {
    expect(readEntry('?course=c9')).toEqual({ kind: 'course', id: 'c9' })
  })
})

describe('return-to', () => {
  it('저장한 경로를 한 번만 돌려준다', () => {
    saveReturnTo('/saved')
    expect(takeReturnTo()).toBe('/saved')
    expect(takeReturnTo()).toBe('/')
  })
  it('외부 주소는 무시하고 /로', () => {
    saveReturnTo('https://evil.example')
    expect(takeReturnTo()).toBe('/')
    saveReturnTo('//evil.example')
    expect(takeReturnTo()).toBe('/')
    saveReturnTo('/\\evil')
    expect(takeReturnTo()).toBe('/')
  })
  it('safePath', () => {
    expect(safePath('/saved?x=1')).toBe('/saved?x=1')
    expect(safePath('//x')).toBe('/')
    expect(safePath('/\\evil')).toBe('/')
    expect(safePath(null)).toBe('/')
  })
})

describe('pending sources', () => {
  it('한 번만 꺼낸다', () => {
    savePending({ youtube: true, photos: true })
    expect(takePending()).toEqual({ youtube: true, photos: true })
    expect(takePending()).toBeNull()
  })
})
