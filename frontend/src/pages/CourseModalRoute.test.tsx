import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { fetchCourse } from '../planner/api'
import { ToastProvider } from '../state/toast'
import { AuthProvider } from '../state/auth'
import { CoursesProvider } from '../state/courses'
import { AnalysisProvider } from '../state/analysis'
import CourseModalRoute from './CourseModalRoute'

vi.mock('../planner/api', async (orig) => ({ ...(await orig<typeof import('../planner/api')>()), fetchCourse: vi.fn(), fetchMe: vi.fn(() => new Promise(() => {})) }))
beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
})
afterEach(cleanup)

function Where() { return <div data-testid="where">{useLocation().pathname}</div> }

it('없는 코스 id로 들어오면 안내 후 /courses로', async () => {
  vi.mocked(fetchCourse).mockRejectedValue(new Error('요청 실패 (HTTP 404)'))
  render(
    <MemoryRouter initialEntries={['/course/nope']}>
      <ToastProvider><AuthProvider><CoursesProvider><AnalysisProvider>
        <Routes>
          <Route path="/course/:id" element={<CourseModalRoute />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </AnalysisProvider></CoursesProvider></AuthProvider></ToastProvider>
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/courses'))
  expect(screen.getByRole('status').textContent).toContain('코스를 열지 못했어요')
})
