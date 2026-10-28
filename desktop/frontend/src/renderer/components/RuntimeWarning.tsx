import type { FC } from 'react'
import type { RuntimePreview } from '../../shared/types'

interface RuntimeWarningProps {
  preview: RuntimePreview
  isInstalling: boolean
  onInstall: () => void
  className?: string
}

/**
 * 运行缺失警告条：提示需要的 Node 版本并提供安装入口。
 */
const RuntimeWarning: FC<RuntimeWarningProps> = ({
  preview,
  isInstalling,
  onInstall,
  className = '',
}) => {
  const version = preview.requested || preview.version
  const available = preview.available?.filter((item) => item !== '') ?? []
  const title =
    available.length > 0 ? `本机已安装：${available.join('、')}` : undefined

  return (
    <div
      className={`runtime-warning ${className}`.trim()}
      role="alert"
      title={title}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="runtime-warning-text">
        需要 Node {version || '指定版本'}，本机未安装
      </span>
      <button
        type="button"
        className="btn-warning runtime-warning-button"
        disabled={isInstalling}
        onClick={(event) => {
          event.stopPropagation()
          onInstall()
        }}
      >
        {isInstalling ? '正在安装…' : '安装该版本'}
      </button>
    </div>
  )
}

export default RuntimeWarning
