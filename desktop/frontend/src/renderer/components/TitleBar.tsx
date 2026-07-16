import React, { memo, useCallback } from 'react'
import { desktop } from '../lib/desktop'

/**
 * 自绘窗口标题栏。
 *
 * 窗口设为无边框（Wails Frameless），由本组件绘制主题色标题栏，
 * 使 Windows 10/11 都显示应用主题色而非系统默认标题栏颜色。
 *
 * 拖拽通过 CSS `--wails-draggable: drag` 实现（Wails 无边框窗口约定）；
 * 按钮区域需显式设为 no-drag 才能响应点击。
 */
const TitleBar: React.FC = memo(() => {
  const handleMinimise = useCallback(() => {
    void desktop.minimiseWindow()
  }, [])

  const handleToggleMaximise = useCallback(() => {
    void desktop.toggleMaximiseWindow()
  }, [])

  const handleClose = useCallback(() => {
    void desktop.closeWindow()
  }, [])

  return (
    <div className="titlebar">
      <div className="titlebar-drag" onDoubleClick={handleToggleMaximise}>
        <span className="titlebar-title">开发服务器启动工具</span>
      </div>

      <div className="titlebar-controls">
        <button
          type="button"
          className="titlebar-button"
          aria-label="最小化"
          onClick={handleMinimise}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>

        <button
          type="button"
          className="titlebar-button"
          aria-label="最大化/还原"
          onClick={handleToggleMaximise}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect
              x="0.5"
              y="0.5"
              width="9"
              height="9"
              fill="none"
              stroke="currentColor"
            />
          </svg>
        </button>

        <button
          type="button"
          className="titlebar-button titlebar-button-close"
          aria-label="关闭"
          onClick={handleClose}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path
              d="M0 0 L10 10 M10 0 L0 10"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
        </button>
      </div>
    </div>
  )
})

TitleBar.displayName = 'TitleBar'

export default TitleBar
