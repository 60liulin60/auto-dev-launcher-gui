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

/**
 * 错误边界组件
 * 捕获子组件树中的JavaScript错误，显示降级UI
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    // 更新状态以显示降级UI
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 记录错误信息
    console.error('ErrorBoundary caught an error:', error, errorInfo)

    // 调用自定义错误处理函数
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    // 在生产环境中，可以发送错误报告到服务器
    if (process.env.NODE_ENV === 'production') {
      // TODO: 发送错误报告
      // reportError(error, errorInfo)
    }
  }

  render() {
    if (this.state.hasError) {
      // 渲染自定义降级UI
      if (this.props.fallback) {
        return this.props.fallback
      }

      // 默认降级UI
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h2>⚠️ 出错了</h2>
            <p>应用程序遇到了一些问题，请尝试刷新页面或重启应用。</p>
            <details className="error-details">
              <summary>错误详情</summary>
              <pre className="error-stack">
                {this.state.error?.stack}
              </pre>
            </details>
            <div className="error-actions">
              <button
                className="btn-primary"
                onClick={() => window.location.reload()}
              >
                🔄 刷新页面
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  // 重置错误状态，尝试重新渲染
                  this.setState({ hasError: false, error: undefined })
                }}
              >
                🔧 尝试恢复
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * 带有重试功能的错误边界
 */
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

    // 如果重试次数未达到上限，自动重试
    if (retryCount < this.maxRetries) {
      setTimeout(() => {
        this.setState(prevState => ({
          hasError: false,
          error: undefined,
          retryCount: prevState.retryCount + 1
        }))
      }, 1000 * (retryCount + 1)) // 递增延迟
    }
  }

  render() {
    if (this.state.hasError) {
      const { retryCount } = this.state

      if (retryCount < this.maxRetries) {
        return (
          <div className="error-boundary">
            <div className="error-boundary-content">
              <h2>🔄 自动重试中...</h2>
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

      // 重试失败，显示错误UI
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h2>❌ 恢复失败</h2>
            <p>经过多次尝试后仍无法恢复应用程序正常运行。</p>
            <details className="error-details">
              <summary>错误详情</summary>
              <pre className="error-stack">
                {this.state.error?.stack}
              </pre>
            </details>
            <div className="error-actions">
              <button
                className="btn-primary"
                onClick={() => window.location.reload()}
              >
                🔄 刷新页面
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
