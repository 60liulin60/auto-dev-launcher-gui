import React, { memo } from 'react'
import { ProjectListProps, ServerState } from '../types'
import ProjectCard from './ProjectCard'

// 复用一个稳定的 idle 对象：每次渲染都新建 { status:'idle', output:[] } 会击穿 ProjectCard 的 memo。
const IDLE_SERVER_STATE: ServerState = { status: 'idle', output: [] }

const ProjectList: React.FC<ProjectListProps> = memo(({
  projects,
  serverStates,
  selectedProjectId,
  onProjectSelect,
  onProjectLaunch,
  onProjectStop,
  onProjectEdit,
  onProjectOpen,
  onProjectRemove
}) => {
  const getServerState = (projectId: string): ServerState => {
    return serverStates.get(projectId) || IDLE_SERVER_STATE
  }

  if (projects.length === 0) {
    return (
      <div className="projects-section">
        <h2>项目</h2>
        <p className="empty-message">暂无项目，请先选择目录或脚本。</p>
      </div>
    )
  }

  return (
    <div className="projects-section">
      <h2>项目</h2>
      <div className="projects-list">
        {projects.map((project) => {
          const serverState = getServerState(project.id)
          const isSelected = selectedProjectId === project.id

          return (
            <ProjectCard
              key={project.id}
              project={project}
              serverState={serverState}
              isSelected={isSelected}
              onSelect={onProjectSelect}
              onLaunch={onProjectLaunch}
              onStop={onProjectStop}
              onEdit={onProjectEdit}
              onOpenInExplorer={onProjectOpen}
              onRemove={onProjectRemove}
            />
          )
        })}
      </div>
    </div>
  )
})

ProjectList.displayName = 'ProjectList'

export default ProjectList
