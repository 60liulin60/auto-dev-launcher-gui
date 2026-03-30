import React, { memo } from 'react'
import { HeaderProps } from '../types'

const Header: React.FC<HeaderProps> = memo(({
  onSelectFolder,
  isLoading = false,
  launchOnStartup,
  closeToTrayOnClose,
  onLaunchOnStartupChange,
  onCloseToTrayOnCloseChange,
}) => {
  return (
    <header className="header">
      <h1>开发服务管理器</h1>

      <div className="header-settings">
        <label className="header-setting-item">
          <input
            type="checkbox"
            checked={launchOnStartup}
            onChange={(event) => onLaunchOnStartupChange(event.target.checked)}
          />
          <span>开机自启</span>
        </label>

        <label className="header-setting-item">
          <input
            type="checkbox"
            checked={closeToTrayOnClose}
            onChange={(event) => onCloseToTrayOnCloseChange(event.target.checked)}
          />
          <span>关闭时最小化到托盘</span>
        </label>
      </div>

      <button
        onClick={onSelectFolder}
        className="btn-primary"
        disabled={isLoading}
      >
        {isLoading ? '处理中...' : '选择项目'}
      </button>
    </header>
  )
})

Header.displayName = 'Header'

export default Header
