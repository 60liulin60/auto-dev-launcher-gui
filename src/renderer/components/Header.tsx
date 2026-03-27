import React, { memo } from 'react'
import { HeaderProps } from '../types'

const Header: React.FC<HeaderProps> = memo(({ onSelectFolder, isLoading = false }) => {
  return (
    <header className="header">
      <h1>开发服务管理</h1>
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
