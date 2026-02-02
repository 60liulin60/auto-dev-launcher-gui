import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AppProvider } from './contexts/AppContext'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// 全局错误处理函数
const handleGlobalError = (error: Error, errorInfo: React.ErrorInfo) => {
  // 在开发环境中输出详细信息
  if (process.env.NODE_ENV === 'development') {
    console.error('Global error caught by ErrorBoundary:', error)
    console.error('Error info:', errorInfo)
  }

  // 在生产环境中可以发送错误报告
  // TODO: 实现错误报告功能
  // reportErrorToService(error, errorInfo)
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
            <h1 style={{ color: '#ff6b6b' }}>🚨 应用程序崩溃</h1>
            <p>请重启应用程序或联系技术支持</p>
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
