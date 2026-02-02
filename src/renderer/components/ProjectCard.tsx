import React, { memo } from 'react'
import { ProjectCardProps, ServerStatus } from '../types'

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
      case 'idle': return '未启动'
      case 'starting': return '启动中'
      case 'running': return '运行中'
      case 'stopped': return '已停止'
      case 'error': return '错误'
    }
  }

  const getStatusColor = (status: ServerStatus) => {
    switch (status) {
      case 'idle': return '#a8b5c9'
      case 'starting': return '#d4a574'
      case 'running': return '#7eb89f'
      case 'stopped': return '#a8b5c9'
      case 'error': return '#d47d7d'
    }
  }

  const isRunning = serverState.status === 'running' || serverState.status === 'starting'

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
          最后启动: {new Date(project.lastLaunched).toLocaleString()}
        </p>
      </div>
      <div className="project-actions">
        {!isRunning ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onLaunch(project)
            }}
            className="btn-success"
          >
            ▶ 启动
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onStop(project.id)
            }}
            className="btn-warning"
          >
            ⏹ 停止
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onOpenInExplorer(project.path)
          }}
          className="btn-secondary"
        >
          📂 打开
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove(project.id)
          }}
          className="btn-danger"
        >
          🗑 删除
        </button>
      </div>
    </div>
  )
})

ProjectCard.displayName = 'ProjectCard'

export default ProjectCard
