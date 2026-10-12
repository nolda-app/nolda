import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './planner/planner.css'
import App from './App.tsx'
import { ToastProvider } from './state/toast'
import { AuthProvider } from './state/auth'
import { CoursesProvider } from './state/courses'
import { AnalysisProvider } from './state/analysis'
import { ScanProvider } from './state/scan'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <CoursesProvider>
            <AnalysisProvider>
              <ScanProvider>
                <App />
              </ScanProvider>
            </AnalysisProvider>
          </CoursesProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
