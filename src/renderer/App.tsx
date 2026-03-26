import { useCallback, useEffect, useMemo, useRef } from 'react'
import './App.css'
import { ServerState, ServerStatus } from './types'
import { useApp } from './contexts/AppContext'
import { ProjectHistoryEntry } from '../shared/types'
import Header from './components/Header'
import ProjectList from './components/ProjectList'
import OutputConsole from './components/OutputConsole'

const MAX_OUTPUT_CHUNKS = 100
const SERVER_STOP_SETTLE_DELAY = 2000

// Avoid allocating a large intermediate array on every flush when logs are noisy.
function mergeOutputChunks(currentOutput: string[], incomingOutput: string[]): string[] {
  if (incomingOutput.length >= MAX_OUTPUT_CHUNKS) {
    return incomingOutput.slice(-MAX_OUTPUT_CHUNKS)
  }

  const overflow = currentOutput.length + incomingOutput.length - MAX_OUTPUT_CHUNKS

  if (overflow <= 0) {
    return [...currentOutput, ...incomingOutput]
  }

  return [...currentOutput.slice(overflow), ...incomingOutput]
}

function createIdleServerState(): ServerState {
  return { status: 'idle', output: [] }
}

function isServerActive(status: ServerStatus): boolean {
  return status === 'running' || status === 'starting'
}

function App() {
  const {
    state,
    loadProjects,
    setSelectedFolder,
    setSelectedProject,
    updateServerState,
    updateServerStateWith,
    getServerState
  } = useApp()

  const isLaunchingRef = useRef(false)
  const stoppingProjectsRef = useRef<Set<string>>(new Set())
  const pendingOutputsRef = useRef<Map<string, string[]>>(new Map())
  const rafIdRef = useRef<number | null>(null)

  // Keep the latest state reachable from async stop/remove flows.
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  // Batch IPC log bursts into one paint so the renderer stays responsive.
  const flushOutputs = useCallback(() => {
    if (pendingOutputsRef.current.size === 0) {
      rafIdRef.current = null
      return
    }

    pendingOutputsRef.current.forEach((outputs, projectId) => {
      if (outputs.length === 0) {
        return
      }

      updateServerStateWith(projectId, (currentState) => ({
        ...currentState,
        status: currentState.status === 'idle' ? 'running' as ServerStatus : currentState.status,
        output: mergeOutputChunks(currentState.output, outputs)
      }))
    })

    pendingOutputsRef.current.clear()
    rafIdRef.current = null
  }, [updateServerStateWith])

  const applyServerStatus = useCallback((projectId: string, status: ServerStatus) => {
    updateServerStateWith(projectId, (currentState) => ({
      ...currentState,
      status
    }))
  }, [updateServerStateWith])

  const applyDetectedUrl = useCallback((projectId: string, detectedUrl: string) => {
    updateServerStateWith(projectId, (currentState) => {
      if (currentState.detectedUrl === detectedUrl) {
        return currentState
      }

      return {
        ...currentState,
        detectedUrl
      }
    })
  }, [updateServerStateWith])

  // Read from the ref so async handlers never work with a stale server snapshot.
  const getLatestServerState = useCallback((projectId: string): ServerState => {
    return stateRef.current.serverStates.get(projectId) || createIdleServerState()
  }, [])

  // Reuse the same bounded-output policy for lifecycle messages and log chunks.
  const pushLifecycleMessage = useCallback((projectId: string, status: ServerStatus, message: string) => {
    const currentState = getLatestServerState(projectId)

    updateServerState(projectId, {
      ...currentState,
      status,
      output: mergeOutputChunks(currentState.output, [message])
    })
  }, [getLatestServerState, updateServerState])

  // Electron IPC listeners do not expose unsubscribe hooks here, so setup must stay idempotent.
  const isListenerSetupRef = useRef(false)

  const loadHistory = useCallback(async () => {
    try {
      const history = await window.electronAPI.loadHistory()
      loadProjects(history)
    } catch (error) {
      console.error('Failed to load history:', error)
    }
  }, [loadProjects])

  useEffect(() => {
    if (isListenerSetupRef.current) {
      return
    }

    // Buffer log chunks until the next paint to avoid a render per IPC event.
    const handleServerOutput = (projectId: string, output: string) => {
      const currentOutputs = pendingOutputsRef.current.get(projectId) || []
      currentOutputs.push(output)
      pendingOutputsRef.current.set(projectId, currentOutputs)

      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(flushOutputs)
      }
    }

    const handleServerStatusChange = (projectId: string, status: string) => {
      applyServerStatus(projectId, status as ServerStatus)
    }

    const handleServerUrlDetected = (projectId: string, url: string) => {
      applyDetectedUrl(projectId, url)
    }

    window.electronAPI.onServerOutput(handleServerOutput)
    window.electronAPI.onServerStatusChange(handleServerStatusChange)
    window.electronAPI.onServerUrlDetected(handleServerUrlDetected)

    isListenerSetupRef.current = true
    loadHistory()

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [applyDetectedUrl, applyServerStatus, loadHistory, flushOutputs])

  const handleSelectFolder = useCallback(async () => {
    try {
      const folder = await window.electronAPI.selectFolder()
      if (folder) {
        setSelectedFolder(folder)

        try {
          const config = await window.electronAPI.loadConfig(folder)
          const projectId = btoa(encodeURIComponent(folder))

          await window.electronAPI.addToHistory({
            id: projectId,
            name: config.name || folder.split('\\').pop() || folder.split('/').pop() || 'Unknown',
            path: folder,
            lastLaunched: new Date(),
            config,
          })

          await loadHistory()
        } catch (error: any) {
          console.error('Failed to load config:', error)
          alert(`无法加载项目配置:\n${error.message || error}\n\n请确保项目文件夹中包含 package.json 文件`)
        }
      }
    } catch (error) {
      console.error('Failed to select folder:', error)
    }
  }, [loadHistory, setSelectedFolder])

  const handleLaunchProject = useCallback(async (project: ProjectHistoryEntry) => {
    stoppingProjectsRef.current.delete(project.id)

    if (isLaunchingRef.current) {
      return
    }

    isLaunchingRef.current = true

    try {
      updateServerState(project.id, { status: 'starting', output: [] })
      await window.electronAPI.startServer(project.id, project.path, project.config)
      setSelectedProject(project.id)
    } catch (error: any) {
      console.error('[App] Failed to start server:', error)
      alert(`启动失败: ${error.message || error}`)

      updateServerState(project.id, {
        status: 'error',
        output: [`错误: ${error.message || error}`]
      })
    } finally {
      isLaunchingRef.current = false
    }
  }, [setSelectedProject, updateServerState])

  const handleStopProject = useCallback((projectId: string) => {
    if (stoppingProjectsRef.current.has(projectId)) {
      return
    }

    stoppingProjectsRef.current.add(projectId)
    pushLifecycleMessage(projectId, 'stopped', '正在停止服务器...')

    window.electronAPI.stopServer(projectId)
      .catch((error: any) => {
        console.error('[App] Failed to stop server:', error)
        pushLifecycleMessage(projectId, 'running', `停止失败: ${error.message || error}`)
      })
      .finally(() => {
        stoppingProjectsRef.current.delete(projectId)
      })
  }, [pushLifecycleMessage])

  const handleOpenInExplorer = useCallback(async (path: string) => {
    try {
      await window.electronAPI.openInExplorer(path)
    } catch (error) {
      console.error('Failed to open in explorer:', error)
    }
  }, [])

  const handleRemoveFromHistory = useCallback(async (projectId: string) => {
    if (!confirm('确定要从历史记录中删除此项目吗？')) {
      return
    }

    try {
      const serverState = getLatestServerState(projectId)

      if (isServerActive(serverState.status)) {
        try {
          pushLifecycleMessage(projectId, 'stopped', '正在停止服务器以删除项目...')
          await window.electronAPI.stopServer(projectId)
          await new Promise((resolve) => setTimeout(resolve, SERVER_STOP_SETTLE_DELAY))
        } catch (error) {
          console.error('[App] Failed to stop server before removal:', error)
          alert(`停止服务器失败: ${error}\n\n将继续删除项目,但端口可能仍被占用。`)
        }
      }

      await window.electronAPI.removeFromHistory(projectId)
      await loadHistory()

      if (stateRef.current.selectedProjectId === projectId) {
        setSelectedProject(null)
      }
    } catch (error) {
      console.error('[App] Failed to remove from history:', error)
      alert(`删除失败: ${error}`)
    }
  }, [getLatestServerState, loadHistory, pushLifecycleMessage, setSelectedProject])

  const selectedServerState = useMemo(() => {
    if (!state.selectedProjectId) {
      return null
    }

    return getServerState(state.selectedProjectId)
  }, [getServerState, state.selectedProjectId])

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
            serverState={selectedServerState}
          />
        </div>
      </main>
    </div>
  )
}

export default App
