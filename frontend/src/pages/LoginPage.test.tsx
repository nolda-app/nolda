import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../state/auth'
import LoginPage from './LoginPage'

beforeEach(() => { localStorage.clear(); sessionStorage.clear() })
afterEach(cleanup)

describe('/login', () => {
  it('게스트도 로그인 화면을 볼 수 있다', () => {
    sessionStorage.setItem('nolda:guest', '1')
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider><Routes><Route path="/login" element={<LoginPage />} /></Routes></AuthProvider>
      </MemoryRouter>,
    )
    expect(screen.getByText('카카오로 계속하기')).toBeTruthy()
  })
})
