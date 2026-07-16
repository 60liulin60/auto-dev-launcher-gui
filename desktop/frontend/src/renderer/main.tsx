import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

const ROOT_ID = 'root'

function renderFatalScreen(error: unknown) {
  const root = document.getElementById(ROOT_ID) ?? document.body
  const container = document.createElement('div')
  const title = document.createElement('h1')
  const message = document.createElement('p')
  const detail = document.createElement('pre')

  container.style.minHeight = '100vh'
  container.style.display = 'flex'
  container.style.alignItems = 'center'
  container.style.justifyContent = 'center'
  container.style.padding = '24px'
  container.style.backgroundColor = '#1a1d2e'
  container.style.color = '#e8edf5'
  container.style.fontFamily = 'JetBrains Mono, monospace'

  title.textContent = '应用启动失败'
  title.style.margin = '0 0 12px'
  title.style.color = '#ff6b6b'

  message.textContent = '渲染入口发生异常，请重启应用。若问题持续存在，请联系技术支持。'
  message.style.margin = '0 0 12px'
  message.style.lineHeight = '1.6'

  detail.textContent = error instanceof Error ? error.stack ?? error.message : String(error)
  detail.style.margin = '0'
  detail.style.padding = '12px'
  detail.style.maxWidth = '720px'
  detail.style.maxHeight = '320px'
  detail.style.overflow = 'auto'
  detail.style.whiteSpace = 'pre-wrap'
  detail.style.backgroundColor = 'rgba(0, 0, 0, 0.25)'
  detail.style.border = '1px solid #2d3548'

  const content = document.createElement('div')
  content.style.width = 'min(100%, 760px)'
  content.style.padding = '24px'
  content.style.border = '1px solid #2d3548'
  content.style.backgroundColor = '#22273b'
  content.style.boxShadow = '0 0 20px rgba(124, 156, 191, 0.15)'

  content.appendChild(title)
  content.appendChild(message)
  content.appendChild(detail)
  container.appendChild(content)
  root.replaceChildren(container)
}

window.addEventListener('error', (event) => {
  console.error('Global window error:', event.error ?? event.message)
  renderFatalScreen(event.error ?? event.message)
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason)
  renderFatalScreen(event.reason)
})

const handleGlobalError = (error: Error, errorInfo: React.ErrorInfo) => {
  if (import.meta.env.DEV) {
    console.error('Global error caught by ErrorBoundary:', error)
    console.error('Error info:', errorInfo)
  }
}

async function bootstrap() {
  const rootElement = document.getElementById(ROOT_ID)

  if (!rootElement) {
    throw new Error('Root element not found')
  }

  const [appModule, providerModule, boundaryModule, dialogModule] = await Promise.all([
    import('./App'),
    import('./contexts/AppContext'),
    import('./components/ErrorBoundary'),
    import('./contexts/DialogContext'),
  ])

  const App = appModule.default
  const AppProvider = providerModule.AppProvider
  const ErrorBoundary = boundaryModule.default
  const DialogProvider = dialogModule.DialogProvider

  ReactDOM.createRoot(rootElement).render(
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
            justifyContent: 'center',
          }}>
            <div>
              <h1 style={{ color: '#ff6b6b' }}>应用崩溃</h1>
              <p>请重启应用程序或联系技术支持。</p>
            </div>
          </div>
        }
      >
        <AppProvider>
          <DialogProvider>
            <App />
          </DialogProvider>
        </AppProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  )
}

void bootstrap().catch((error) => {
  console.error('Failed to bootstrap renderer:', error)
  renderFatalScreen(error)
})