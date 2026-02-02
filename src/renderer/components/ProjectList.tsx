import React, { memo } from 'react'
import { ProjectListProps, ServerState } from '../types'
import ProjectCard from './ProjectCard'

const ProjectList: React.FC<ProjectListProps> = memo(({
  projects,
  serverStates,
  selectedProjectId,
  onProjectSelect,
  onProjectLaunch,
  onProjectStop,
  onProjectOpen,
  onProjectRemove
}) => {
  // 直接使用传入的 serverStates，而不是从 Context 获取
  const getServerState = (projectId: string): ServerState => {
    return serverStates.get(projectId) || { status: 'idle', output: [] }
  }

  if (projects.length === 0) {
    return (
      <div className="projects-section">
        <h2>项目列表</h2>
        <p className="empty-message">// 暂无项目，请选择一个文件夹开始</p>
      </div>
    )
  }

  return (
    <div className="projects-section">
      <h2>项目列表</h2>
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
