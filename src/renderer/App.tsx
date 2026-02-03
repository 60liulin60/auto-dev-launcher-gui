import { useEffect, useCallback, useState, useRef } from 'react'
import './App.css'
import { ServerStatus } from './types'
import { useApp } from './contexts/AppContext'
import { ProjectHistoryEntry } from '../shared/types'
import Header from './components/Header'
import ProjectList from './components/ProjectList'
import OutputConsole from './components/OutputConsole'

function App() {
  const {
    state,
    dispatch,
    loadProjects,
    setSelectedFolder,
    setSelectedProject,
    updateServerState,
    getServerState
  } = useApp()

  const [isLaunching, setIsLaunching] = useState(false)
  
  // 使用 ref 来跟踪正在停止的项目,避免依赖问题
  const stoppingProjectsRef = useRef<Set<string>>(new Set())

  // 创建 state ref 以在事件监听器中访问最新状态
  const stateRef = useRef(state)
  
  // 更新 state ref
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // 创建 dispatch ref
  const dispatchRef = useRef(dispatch)

  // 更新 dispatch ref
  useEffect(() => {
    dispatchRef.current = dispatch
  }, [dispatch])

  // 使用 ref 来跟踪监听器是否已设置
  const isListenerSetupRef = useRef(false)

  // 加载历史记录
  const loadHistory = useCallback(async () => {
    try {
      const history = await window.electronAPI.loadHistory()
      loadProjects(history)
    } catch (error) {
      console.error('Failed to load history:', error)
    }
  }, [loadProjects])

  // 初始化应用 - 只执行一次
  useEffect(() => {
    // 检查监听器是否已经设置
    if (isListenerSetupRef.current) {
      console.log('[App] Listeners already setup, skipping')
      return
    }
    
    // 设置事件监听器 - 使用函数式更新避免闭包问题
    const handleServerOutput = (projectId: string, output: string) => {
      console.log('[App] Received server output:', projectId, output.substring(0, 50))
      
      // 使用函数式更新,确保获取最新状态
      dispatchRef.current({
        type: 'UPDATE_SERVER_STATE_FUNCTIONAL',
        payload: {
          projectId,
          updater: (currentState) => {
            console.log('[App] Current state:', currentState.status, 'outputs:', currentState.output.length)
            const newState = {
              ...currentState,
              status: currentState.status === 'idle' ? 'running' as ServerStatus : currentState.status,
              output: [...currentState.output, output].slice(-100)
            }
            console.log('[App] New state:', newState.status, 'outputs:', newState.output.length)
            return newState
          }
        }
      })
    }

    const handleServerStatusChange = (projectId: string, status: string) => {
      console.log('[App] Received status change:', projectId, status)
      
      dispatchRef.current({
        type: 'UPDATE_SERVER_STATE_FUNCTIONAL',
        payload: {
          projectId,
          updater: (currentState) => ({
            ...currentState,
            status: status as ServerStatus
          })
        }
      })
    }

    // 注册监听器
    console.log('[App] Setting up IPC listeners')
    window.electronAPI.onServerOutput(handleServerOutput)
    window.electronAPI.onServerStatusChange(handleServerStatusChange)
    
    // 标记监听器已设置
    isListenerSetupRef.current = true

    // 加载历史记录
    loadHistory()

    // 注意：这里不设置清理函数，因为electron的IPC监听器不支持清理
  }, [loadHistory]) // 移除 state.serverStates 依赖，避免重复注册监听器

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
  const handleLaunchProject = useCallback(async (project: ProjectHistoryEntry) => {
    console.log('[App] handleLaunchProject called:', project)
    
    // 清理可能残留的停止标记
    if (stoppingProjectsRef.current.has(project.id)) {
      console.log('[App] Cleaning up stale stopping flag for:', project.id)
      stoppingProjectsRef.current.delete(project.id)
    }
    
    // 防止重复启动
    if (isLaunching) {
      console.log('[App] Already launching, skipping')
      return
    }

    setIsLaunching(true)

    try {
      console.log('[App] Initializing server state for:', project.id)
      // 初始化状态 - 确保状态被正确设置
      const initialState = { status: 'starting' as ServerStatus, output: [] }
      console.log('[App] Setting initial state:', initialState)
      updateServerState(project.id, initialState)
      
      // 验证状态是否被设置
      setTimeout(() => {
        const verifyState = getServerState(project.id)
        console.log('[App] Verified state after init:', verifyState)
      }, 100)

      console.log('[App] Calling startServer API')
      await window.electronAPI.startServer(project.id, project.path, project.config)
      console.log('[App] Server started successfully')
      setSelectedProject(project.id)
    } catch (error: any) {
      console.error('[App] Failed to start server:', error)
      alert(`启动失败: ${error.message || error}`)

      updateServerState(project.id, {
        status: 'error',
        output: [`错误: ${error.message || error}`]
      })
    } finally {
      setIsLaunching(false)
    }
  }, [isLaunching, updateServerState, setSelectedProject, getServerState])

  // 停止项目
  const handleStopProject = useCallback((projectId: string) => {
    console.log('[App] handleStopProject called:', projectId)
    console.log('[App] Current stopping projects:', Array.from(stoppingProjectsRef.current))
    
    // 防止重复点击
    if (stoppingProjectsRef.current.has(projectId)) {
      console.log('[App] Already stopping this project, skipping')
      return
    }
    
    // 标记为正在停止
    stoppingProjectsRef.current.add(projectId)
    console.log('[App] Added to stopping projects:', projectId)
    
    // 立即更新 UI 状态为"已停止"
    const currentState = stateRef.current.serverStates.get(projectId) || { status: 'idle' as ServerStatus, output: [] }
    updateServerState(projectId, {
      ...currentState,
      status: 'stopped',
      output: [...currentState.output, '正在停止服务器...']
    })
    console.log('[App] UI updated to stopped state')
    
    // 在后台异步调用停止 API,不等待完成
    console.log('[App] Calling stopServer API in background...')
    window.electronAPI.stopServer(projectId)
      .then(() => {
        console.log('[App] stopServer API completed successfully')
        // 后端会发送 status-change 事件,前端会自动更新状态
      })
      .catch((error: any) => {
        console.error('[App] Failed to stop server:', error)
        // 如果停止失败,恢复运行状态
        const errorState = stateRef.current.serverStates.get(projectId) || { status: 'idle' as ServerStatus, output: [] }
        updateServerState(projectId, {
          ...errorState,
          status: 'running',
          output: [...errorState.output, `停止失败: ${error.message || error}`]
        })
      })
      .finally(() => {
        // API 调用完成后清理停止标记
        console.log('[App] Cleaning up stopping flag for:', projectId)
        stoppingProjectsRef.current.delete(projectId)
        console.log('[App] Removed from stopping projects. Remaining:', Array.from(stoppingProjectsRef.current))
      })
  }, [updateServerState])

  // 在文件管理器中打开
  const handleOpenInExplorer = async (path: string) => {
    try {
      await window.electronAPI.openInExplorer(path)
    } catch (error) {
      console.error('Failed to open in explorer:', error)
    }
  }

  // 从历史中移除
  const handleRemoveFromHistory = useCallback(async (projectId: string) => {
    console.log('[App] handleRemoveFromHistory called:', projectId)
    if (!confirm('确定要从历史记录中删除此项目吗？')) {
      return
    }
    
    try {
      // 使用 stateRef 获取最新的服务器状态
      const serverState = stateRef.current.serverStates.get(projectId) || { status: 'idle' as ServerStatus, output: [] }
      console.log('[App] Current server state:', serverState)
      
      // 先检查服务器是否在运行，如果在运行则先停止
      if (serverState.status === 'running' || serverState.status === 'starting') {
        console.log('[App] Server is running, stopping first...')
        try {
          // 立即更新 UI 状态
          updateServerState(projectId, {
            ...serverState,
            status: 'stopped',
            output: [...serverState.output, '正在停止服务器以删除项目...']
          })
          
          // 调用停止 API (会立即终止进程)
          await window.electronAPI.stopServer(projectId)
          
          // 等待2秒确保端口完全释放
          console.log('[App] Waiting for port to be released...')
          await new Promise(resolve => setTimeout(resolve, 2000))
          console.log('[App] Server stopped and port released')
        } catch (error) {
          console.error('[App] Failed to stop server before removal:', error)
          alert(`停止服务器失败: ${error}\n\n将继续删除项目,但端口可能仍被占用。`)
          // 即使停止失败也继续删除
        }
      }

      console.log('[App] Removing from history...')
      await window.electronAPI.removeFromHistory(projectId)
      await loadHistory()

      if (stateRef.current.selectedProjectId === projectId) {
        setSelectedProject(null)
      }
      console.log('[App] Project removed successfully')
    } catch (error) {
      console.error('[App] Failed to remove from history:', error)
      alert(`删除失败: ${error}`)
    }
  }, [loadHistory, setSelectedProject, updateServerState])


  return (
    <div className="app">
      <Header onSelectFolder={handleSelectFolder} />

      <main className="main">
        {state.selectedFolder && (
          <div className="selected-folder">
            <p>已选择: {state.selectedFolder}</p>
          </div>
        )}

        <div className="content-layout">
          <ProjectList
            projects={state.projects}
            serverStates={state.serverStates}
            selectedProjectId={state.selectedProjectId}
            onProjectSelect={setSelectedProject}
            onProjectLaunch={handleLaunchProject}
            onProjectStop={handleStopProject}
            onProjectOpen={handleOpenInExplorer}
            onProjectRemove={handleRemoveFromHistory}
          />

          <OutputConsole
            projectId={state.selectedProjectId}
            serverState={state.selectedProjectId ? getServerState(state.selectedProjectId) : null}
          />
        </div>
      </main>
    </div>
  )
}

export default App
