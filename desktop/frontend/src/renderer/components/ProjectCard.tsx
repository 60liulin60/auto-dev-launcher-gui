import React, { memo } from 'react'
import { ProjectCardProps, ServerStatus } from '../types'
import { desktop } from '../lib/desktop'
import { formatDuration } from '../lib/format'
import RuntimeWarning from './RuntimeWarning'
import { useRuntimePreview } from '../hooks/useRuntimePreview'

const ProjectCard: React.FC<ProjectCardProps> = memo(({
  project,
  serverState,
  isSelected,
  onSelect,
  onLaunch,
  onStop,
  onEdit,
  onOpenInExplorer,
  onRemove
}) => {
  const getStatusText = (status: ServerStatus) => {
    switch (status) {
      case 'idle':
        return '未启动'
      case 'starting':
        return '启动中'
      case 'running':
        return '运行中'
      case 'stopped':
        return '已停止'
      case 'completed':
        return '已完成'
      case 'error':
        return '错误'
    }
  }

  const getStatusColor = (status: ServerStatus) => {
    switch (status) {
      case 'idle':
        return '#a7b5cb'
      case 'starting':
        return '#e3b05f'
      case 'running':
        return '#67c28c'
      case 'stopped':
        return '#a7b5cb'
      case 'completed':
        return '#67c28c'
      case 'error':
        return '#e57c7c'
    }
  }

  const isScriptProject = project.config.kind === 'script'
  const { preview, isInstalling, install } = useRuntimePreview(
    project.path,
    project.runtimeOverride ?? '',
    !isScriptProject
  )

  const isRunning = serverState.status === 'running' || serverState.status === 'starting'
  const detectedUrl = serverState.detectedUrl
  const exitCode = serverState.exitCode
  const duration = formatDuration(serverState.durationMs)
  const runtimeLabel = isScriptProject
    ? '脚本'
    : serverState.runtime
      ? `Node v${serverState.runtime}`
      : '系统默认'
  const runtimeSource = serverState.runtimeSource || preview?.source || '系统默认'
  const runtimeNote = serverState.runtimeNote || preview?.note
  const canRelaunch =
    serverState.status === 'completed' || serverState.status === 'error'

  return (
    <div
      className={`project-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(project.id)}
    >
      <div className="project-info">
        <div className="project-header">
          <h3>{project.name}</h3>
          <span
            className="status-badge"
            style={{ backgroundColor: getStatusColor(serverState.status) }}
          >
            {getStatusText(serverState.status)}
          </span>
          <span className="runtime-badge" title={`运行时来源：${runtimeSource}`}>
            {runtimeLabel}
          </span>
        </div>
        <p className="project-path">{project.path}</p>
        <p className="project-time">
          上次启动：{new Date(project.lastLaunched).toLocaleString()}
        </p>
        {serverState.status === 'completed' && (
          <p className="project-exit-info">
            {[
              '已完成',
              exitCode !== undefined ? `退出码 ${exitCode}` : '',
              duration ? `耗时 ${duration}` : '',
            ]
              .filter((part) => part !== '')
              .join(' · ')}
          </p>
        )}
        {/* 版本缺失时只显示警告条（含安装入口），避免与错误行重复提示。 */}
        {serverState.status === 'error' && !preview?.missing && (
          <p className="project-exit-info error">
            {serverState.errorMessage
              ? `启动失败：${serverState.errorMessage}`
              : exitCode !== undefined
                ? `异常退出 · 退出码 ${exitCode}${duration ? ` · 耗时 ${duration}` : ''}`
                : '启动失败，请查看日志'}
          </p>
        )}
        {preview?.missing && (
          <RuntimeWarning
            preview={preview}
            isInstalling={isInstalling}
            onInstall={() => void install()}
          />
        )}
        {runtimeNote ? <p className="project-runtime-note">{runtimeNote}</p> : null}
        {detectedUrl && isRunning && (
          <a
            className="project-url-link"
            href="#"
            title={`打开 ${detectedUrl}`}
            onClick={(event) => {
              event.stopPropagation()
              event.preventDefault()
              desktop.openInExplorer(detectedUrl).catch(console.error)
            }}
          >
            {detectedUrl}
          </a>
        )}
      </div>
      <div className="project-actions">
        {!isRunning ? (
          <button
            onClick={(event) => {
              event.stopPropagation()
              onLaunch(project)
            }}
            className="btn-success"
          >
            {canRelaunch ? '重新运行' : '启动'}
          </button>
        ) : (
          <button
            onClick={(event) => {
              event.stopPropagation()
              onStop(project.id)
            }}
            className="btn-warning"
          >
            停止
          </button>
        )}
        <button
          onClick={(event) => {
            event.stopPropagation()
            onEdit(project.id)
          }}
          className="btn-secondary"
        >
          设置
        </button>
        <button
          onClick={(event) => {
            event.stopPropagation()
            onOpenInExplorer(project.path)
          }}
          className="btn-secondary"
        >
          打开
        </button>
        <button
          onClick={(event) => {
            event.stopPropagation()
            onRemove(project.id)
          }}
          className="btn-danger"
        >
          移除
        </button>
      </div>
    </div>
  )
})

ProjectCard.displayName = 'ProjectCard'

export default ProjectCard
