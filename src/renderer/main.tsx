import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AppProvider } from './contexts/AppContext'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// Keep the crash screen minimal so the app still feels responsive on fatal errors.
const handleGlobalError = (error: Error, errorInfo: React.ErrorInfo) => {
  if (import.meta.env.DEV) {
    console.error('Global error caught by ErrorBoundary:', error)
    console.error('Error info:', errorInfo)
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary
      onError={handleGlobalError}
      fallback={
        <div style={{
          padding: '20px',
          textAlign: 'center',
          fontFamily: 'monospace',
          backgroundColor: '#1a1a1a',
          color: '#ffffff',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div>
            <h1 style={{ color: '#ff6b6b' }}>🚨 应用崩溃</h1>
            <p>请重启应用程序或联系技术支持。</p>
          </div>
        </div>
      }
    >
      <AppProvider>
        <App />
      </AppProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
