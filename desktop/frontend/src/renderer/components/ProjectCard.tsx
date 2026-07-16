import React, { memo } from 'react'
import { ProjectCardProps, ServerStatus } from '../types'
import { desktop } from '../lib/desktop'

const ProjectCard: React.FC<ProjectCardProps> = memo(({
  project,
  serverState,
  isSelected,
  onSelect,
  onLaunch,
  onStop,
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
      case 'error':
        return '#e57c7c'
    }
  }

  const isRunning = serverState.status === 'running' || serverState.status === 'starting'
  const detectedUrl = serverState.detectedUrl

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
        </div>
        <p className="project-path">{project.path}</p>
        <p className="project-time">
          上次启动：{new Date(project.lastLaunched).toLocaleString()}
        </p>
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
            启动
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
