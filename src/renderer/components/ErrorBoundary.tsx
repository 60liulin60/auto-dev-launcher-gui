import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error?: Error
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)

    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    if (import.meta.env.PROD) {
      // Reserved for future production error reporting.
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h2>⚠️ 出错了</h2>
            <p>应用程序遇到了一些问题，请尝试刷新页面或重启应用。</p>
            <details className="error-details">
              <summary>错误详情</summary>
              <pre className="error-stack">{this.state.error?.stack}</pre>
            </details>
            <div className="error-actions">
              <button className="btn-primary" onClick={() => window.location.reload()}>
                刷新页面
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  this.setState({ hasError: false, error: undefined })
                }}
              >
                尝试恢复
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export class ErrorBoundaryWithRetry extends Component<Props, State & { retryCount: number }> {
  private maxRetries = 3

  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, retryCount: 0 }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { retryCount } = this.state

    console.error(`ErrorBoundary caught an error (attempt ${retryCount + 1}):`, error, errorInfo)

    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    if (retryCount < this.maxRetries) {
      setTimeout(() => {
        this.setState((prevState) => ({
          hasError: false,
          error: undefined,
          retryCount: prevState.retryCount + 1,
        }))
      }, 1000 * (retryCount + 1))
    }
  }

  render() {
    if (this.state.hasError) {
      const { retryCount } = this.state

      if (retryCount < this.maxRetries) {
        return (
          <div className="error-boundary">
            <div className="error-boundary-content">
              <h2>自动重试中...</h2>
              <p>应用程序遇到问题，正在尝试自动恢复 ({retryCount + 1}/{this.maxRetries})</p>
              <div className="retry-progress">
                <div
                  className="retry-bar"
                  style={{ width: `${((retryCount + 1) / this.maxRetries) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )
      }

      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h2>恢复失败</h2>
            <p>经过多次尝试后仍无法恢复应用程序正常运行。</p>
            <details className="error-details">
              <summary>错误详情</summary>
              <pre className="error-stack">{this.state.error?.stack}</pre>
            </details>
            <div className="error-actions">
              <button className="btn-primary" onClick={() => window.location.reload()}>
                刷新页面
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary