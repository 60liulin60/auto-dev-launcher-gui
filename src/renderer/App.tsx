import { useState, useEffect } from 'react'
import './App.css'

interface ServerState {
  status: 'idle' | 'starting' | 'running' | 'stopped' | 'error'
  output: string[]
}

function App() {
  const [projects, setProjects] = useState<any[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [serverStates, setServerStates] = useState<Map<string, ServerState>>(new Map())
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  // 加载项目历史
  useEffect(() => {
    loadHistory()
    
    // 监听服务器输出
    window.electronAPI.onServerOutput((projectId: string, output: string) => {
      setServerStates(prev => {
        const newMap = new Map(prev)
        const state = newMap.get(projectId) || { status: 'running', output: [] }
        state.output.push(output)
        // 只保留最后 100 行
        if (state.output.length > 100) {
          state.output = state.output.slice(-100)
        }
        newMap.set(projectId, state)
        return newMap
      })
    })
    
    // 监听状态变化
    window.electronAPI.onServerStatusChange((projectId: string, status: any) => {
      setServerStates(prev => {
        const newMap = new Map(prev)
        const state = newMap.get(projectId) || { status: 'idle', output: [] }
        state.status = status
        newMap.set(projectId, state)
        return newMap
      })
    })
  }, [])

  const loadHistory = async () => {
    try {
      const history = await window.electronAPI.loadHistory()
      setProjects(history)
    } catch (error) {
      console.error('Failed to load history:', error)
    }
  }

  // 选择文件夹
  const handleSelectFolder = async () => {
    try {
      const folder = await window.electronAPI.selectFolder()
      if (folder) {
        setSelectedFolder(folder)
        
        // 尝试加载配置
        try {
          const config = await window.electronAPI.loadConfig(folder)
          console.log('Config loaded:', config)
          
          // 添加到历史 - 使用简单的哈希方法代替 Buffer
          const projectId = btoa(encodeURIComponent(folder))
          await window.electronAPI.addToHistory({
            id: projectId,
            name: config.name || folder.split('\\').pop() || folder.split('/').pop() || 'Unknown',
            path: folder,
            lastLaunched: new Date(),
            config,
          })
          
          // 重新加载历史
          await loadHistory()
        } catch (error: any) {
          console.error('Failed to load config:', error)
          alert(`无法加载项目配置:\n${error.message || error}\n\n请确保项目文件夹中包含 package.json 文件`)
        }
      }
    } catch (error) {
      console.error('Failed to select folder:', error)
    }
  }

  // 启动项目
  const handleLaunchProject = async (project: any) => {
    try {
      // 初始化状态
      setServerStates(prev => {
        const newMap = new Map(prev)
        newMap.set(project.id, { status: 'starting', output: [] })
        return newMap
      })
      
      await window.electronAPI.startServer(project.id, project.path, project.config)
      setSelectedProjectId(project.id)
    } catch (error: any) {
      console.error('Failed to start server:', error)
      alert(`启动失败: ${error.message || error}`)
      
      setServerStates(prev => {
        const newMap = new Map(prev)
        newMap.set(project.id, { status: 'error', output: [`错误: ${error.message || error}`] })
        return newMap
      })
    }
  }

  // 停止项目
  const handleStopProject = async (projectId: string) => {
    try {
      await window.electronAPI.stopServer(projectId)
      setServerStates(prev => {
        const newMap = new Map(prev)
        const state = newMap.get(projectId)
        if (state) {
          state.status = 'stopped'
          newMap.set(projectId, state)
        }
        return newMap
      })
    } catch (error: any) {
      console.error('Failed to stop server:', error)
      alert(`停止失败: ${error.message || error}`)
    }
  }

  // 在文件管理器中打开
  const handleOpenInExplorer = async (path: string) => {
    try {
      await window.electronAPI.openInExplorer(path)
    } catch (error) {
      console.error('Failed to open in explorer:', error)
    }
  }

  // 从历史中移除
  const handleRemoveFromHistory = async (projectId: string) => {
    if (!confirm('确定要从历史记录中删除此项目吗？')) {
      return
    }
    
    try {
      // 先检查服务器是否在运行，如果在运行则先停止
      const state = getServerState(projectId)
      if (state.status === 'running' || state.status === 'starting') {
        try {
          await window.electronAPI.stopServer(projectId)
          // 等待一小段时间确保服务器完全停止
          await new Promise(resolve => setTimeout(resolve, 500))
        } catch (error) {
          console.error('Failed to stop server before removal:', error)
          // 即使停止失败也继续删除
        }
      }
      
      await window.electronAPI.removeFromHistory(projectId)
      await loadHistory()
      
      // 清除状态
      setServerStates(prev => {
        const newMap = new Map(prev)
        newMap.delete(projectId)
        return newMap
      })
      
      if (selectedProjectId === projectId) {
        setSelectedProjectId(null)
      }
    } catch (error) {
      console.error('Failed to remove from history:', error)
    }
  }

  // 获取服务器状态
  const getServerState = (projectId: string): ServerState => {
    return serverStates.get(projectId) || { status: 'idle', output: [] }
  }

  // 获取状态显示文本
  const getStatusText = (status: string) => {
    switch (status) {
      case 'idle': return '未启动'
      case 'starting': return '启动中'
      case 'running': return '运行中'
      case 'stopped': return '已停止'
      case 'error': return '错误'
      default: return '未知'
    }
  }

  // 获取状态颜色
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'idle': return '#a8b5c9'
      case 'starting': return '#d4a574'
      case 'running': return '#7eb89f'
      case 'stopped': return '#a8b5c9'
      case 'error': return '#d47d7d'
      default: return '#a8b5c9'
    }
  }

  // 渲染输出行，将 URL 转换为可点击链接
  const renderOutputLine = (line: string, index: number) => {
    // URL 正则表达式
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const parts = line.split(urlRegex)
    
    return (
      <div key={index} className="output-line">
        {parts.map((part, i) => {
          if (part.match(urlRegex)) {
            return (
              <a
                key={i}
                href="#"
                className="output-link"
                onClick={(e) => {
                  e.preventDefault()
                  window.electronAPI.openInExplorer(part) // 使用 shell.openExternal
                }}
              >
                {part}
              </a>
            )
          }
          return <span key={i}>{part}</span>
        })}
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <h1>🚀 开发服务器启动工具</h1>
        <button onClick={handleSelectFolder} className="btn-primary">
          📁 选择项目
        </button>
      </header>

      <main className="main">
        {selectedFolder && (
          <div className="selected-folder">
            <p>已选择: {selectedFolder}</p>
          </div>
        )}

        <div className="content-layout">
          <div className="projects-section">
            <h2>项目列表</h2>
            {projects.length === 0 ? (
              <p className="empty-message">// 暂无项目，请选择一个文件夹开始</p>
            ) : (
              <div className="projects-list">
                {projects.map((project) => {
                  const state = getServerState(project.id)
                  const isRunning = state.status === 'running' || state.status === 'starting'
                  const isSelected = selectedProjectId === project.id
                  
                  return (
                    <div 
                      key={project.id} 
                      className={`project-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedProjectId(project.id)}
                    >
                      <div className="project-info">
                        <div className="project-header">
                          <h3>{project.name}</h3>
                          <span 
                            className="status-badge"
                            style={{ backgroundColor: getStatusColor(state.status) }}
                          >
                            {getStatusText(state.status)}
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
                              handleLaunchProject(project)
                            }}
                            className="btn-success"
                          >
                            ▶ 启动
                          </button>
                        ) : (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStopProject(project.id)
                            }}
                            className="btn-warning"
                          >
                            ⏹ 停止
                          </button>
                        )}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenInExplorer(project.path)
                          }}
                          className="btn-secondary"
                        >
                          📂 打开
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoveFromHistory(project.id)
                          }}
                          className="btn-danger"
                        >
                          🗑 删除
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {selectedProjectId && (
            <div className="output-section">
              <h2>服务器输出</h2>
              <div className="output-console">
                {getServerState(selectedProjectId).output.length === 0 ? (
                  <p className="output-empty">// 等待输出...</p>
                ) : (
                  getServerState(selectedProjectId).output.map((line, index) => 
                    renderOutputLine(line, index)
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
