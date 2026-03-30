import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { ServerState, ServerStatus } from './types'
import { useApp } from './contexts/AppContext'
import { AppSettings, ProjectHistoryEntry } from '../shared/types'
import Header from './components/Header'
import ProjectList from './components/ProjectList'
import OutputConsole from './components/OutputConsole'
import { desktop } from './lib/desktop'

const MAX_OUTPUT_CHUNKS = 100
const SERVER_STOP_POLL_INTERVAL_MS = 150
const SERVER_STOP_TIMEOUT_MS = 10_000
const DEFAULT_APP_SETTINGS: AppSettings = {
  windowBounds: {
    width: 1200,
    height: 800,
  },
  theme: 'system',
  maxHistoryEntries: 50,
  launchOnStartup: false,
  closeToTrayOnClose: false,
}

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

function createProjectId(projectPath: string): string {
  return btoa(encodeURIComponent(projectPath))
}

function getProjectName(projectPath: string, fallbackName?: string): string {
  if (fallbackName && fallbackName.trim().length > 0) {
    return fallbackName
  }

  const segments = projectPath.split(/[/\\]/)
  return segments[segments.length - 1] || 'Unknown'
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

function isServerActive(status: ServerStatus): boolean {
  return status === 'running' || status === 'starting'
}

function normalizeStoppedStatus(status: ServerStatus): ServerStatus {
  return status === 'idle' ? 'stopped' : status
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

function App() {
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)

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
  const appSettingsRef = useRef(appSettings)

  // Keep the latest state reachable from async stop/remove flows.
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    appSettingsRef.current = appSettings
  }, [appSettings])

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

  // Append lifecycle text without lying about the current process state.
  const appendOutputMessage = useCallback((projectId: string, message: string) => {
    const currentState = getLatestServerState(projectId)

    updateServerState(projectId, {
      ...currentState,
      output: mergeOutputChunks(currentState.output, [message])
    })
  }, [getLatestServerState, updateServerState])

  const waitForProjectStop = useCallback(async (projectId: string): Promise<ServerStatus> => {
    const deadline = Date.now() + SERVER_STOP_TIMEOUT_MS
    let latestStatus = getLatestServerState(projectId).status

    while (Date.now() <= deadline) {
      try {
        latestStatus = await desktop.getServerStatus(projectId)
      } catch (error) {
        latestStatus = getLatestServerState(projectId).status

        if (!isServerActive(latestStatus)) {
          return normalizeStoppedStatus(latestStatus)
        }

        throw error
      }

      if (!isServerActive(latestStatus)) {
        return normalizeStoppedStatus(latestStatus)
      }

      await sleep(SERVER_STOP_POLL_INTERVAL_MS)
    }

    throw new Error('Server stop timed out. Please try again.')
  }, [getLatestServerState])

  const stopProjectAndWait = useCallback(async (
    projectId: string,
    pendingMessage: string,
  ): Promise<ServerStatus> => {
    const currentState = getLatestServerState(projectId)

    if (!isServerActive(currentState.status)) {
      return normalizeStoppedStatus(currentState.status)
    }

    if (stoppingProjectsRef.current.has(projectId)) {
      return waitForProjectStop(projectId)
    }

    stoppingProjectsRef.current.add(projectId)
    appendOutputMessage(projectId, pendingMessage)

    try {
      try {
        await desktop.stopServer(projectId)
      } catch (error) {
        const latestStatus = getLatestServerState(projectId).status

        if (isServerActive(latestStatus)) {
          throw error
        }
      }

      const finalStatus = await waitForProjectStop(projectId)
      applyServerStatus(projectId, finalStatus)
      return finalStatus
    } finally {
      stoppingProjectsRef.current.delete(projectId)
    }
  }, [appendOutputMessage, applyServerStatus, getLatestServerState, waitForProjectStop])

  const loadHistory = useCallback(async () => {
    try {
      const history = await desktop.loadHistory()
      loadProjects(history)
    } catch (error) {
      console.error('Failed to load history:', error)
    }
  }, [loadProjects])

  const loadSettings = useCallback(async () => {
    try {
      const nextSettings = await desktop.loadSettings()
      setAppSettings(nextSettings)
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }, [])

  const saveSettings = useCallback(async (
    updater: (current: AppSettings) => AppSettings,
    errorPrefix: string,
  ) => {
    const previousSettings = appSettingsRef.current
    const nextSettings = updater(previousSettings)

    appSettingsRef.current = nextSettings
    setAppSettings(nextSettings)

    try {
      const persistedSettings = await desktop.saveSettings(nextSettings)
      appSettingsRef.current = persistedSettings
      setAppSettings(persistedSettings)
    } catch (error) {
      appSettingsRef.current = previousSettings
      setAppSettings(previousSettings)
      alert(`${errorPrefix}: ${getErrorMessage(error)}`)
    }
  }, [])

  const handleLaunchOnStartupChange = useCallback((enabled: boolean) => {
    void saveSettings(
      (current) => ({ ...current, launchOnStartup: enabled }),
      'Failed to update startup setting'
    )
  }, [saveSettings])

  const handleCloseToTrayOnCloseChange = useCallback((enabled: boolean) => {
    void saveSettings(
      (current) => ({ ...current, closeToTrayOnClose: enabled }),
      'Failed to update close behavior setting'
    )
  }, [saveSettings])

  useEffect(() => {
    let isDisposed = false
    let removeListeners: Array<() => void> = []

    // Buffer log chunks until the next paint to avoid a render per IPC event.
    const handleServerOutput = (projectId: string, output: string) => {
      const currentOutputs = pendingOutputsRef.current.get(projectId) || []
      currentOutputs.push(output)
      pendingOutputsRef.current.set(projectId, currentOutputs)

      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(flushOutputs)
      }
    }

    const handleServerStatusChange = (projectId: string, status: ServerStatus) => {
      applyServerStatus(projectId, status)
    }

    const handleServerUrlDetected = (projectId: string, url: string) => {
      applyDetectedUrl(projectId, url)
    }

    void (async () => {
      const nextRemoveListeners = await Promise.all([
        desktop.onServerOutput(handleServerOutput),
        desktop.onServerStatusChange(handleServerStatusChange),
        desktop.onServerUrlDetected(handleServerUrlDetected),
      ])

      if (isDisposed) {
        nextRemoveListeners.forEach((removeListener) => removeListener())
        return
      }

      removeListeners = nextRemoveListeners
      await Promise.all([loadHistory(), loadSettings()])
    })()

    return () => {
      isDisposed = true
      removeListeners.forEach((removeListener) => removeListener())

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [applyDetectedUrl, applyServerStatus, loadHistory, loadSettings, flushOutputs])

  const handleSelectFolder = useCallback(async () => {
    try {
      const folder = await desktop.selectFolder()
      if (folder) {
        setSelectedFolder(folder)

        try {
          const config = await desktop.loadConfig(folder)
          const projectId = createProjectId(folder)

          await desktop.addToHistory({
            id: projectId,
            name: getProjectName(folder, config.name),
            path: folder,
            lastLaunched: new Date(),
            config,
          })

          await loadHistory()
        } catch (error) {
          console.error('Failed to load config:', error)
          alert('Failed to load project config:\n' + getErrorMessage(error) + '\n\nMake sure the folder contains dev-config.json or package.json.')
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
      await desktop.startServer(project.id, project.path, project.config)
      setSelectedProject(project.id)
    } catch (error) {
      const errorMessage = getErrorMessage(error)

      console.error('[App] Failed to start server:', error)
      alert('Start failed: ' + errorMessage)

      updateServerState(project.id, {
        status: 'error',
        output: ['Error: ' + errorMessage]
      })
    } finally {
      isLaunchingRef.current = false
    }
  }, [setSelectedProject, updateServerState])

  const handleStopProject = useCallback((projectId: string) => {
    void stopProjectAndWait(projectId, 'Stopping server...')
      .catch((error) => {
        console.error('[App] Failed to stop server:', error)
        appendOutputMessage(projectId, 'Stop failed: ' + getErrorMessage(error))
      })
  }, [appendOutputMessage, stopProjectAndWait])

  const handleOpenInExplorer = useCallback(async (path: string) => {
    try {
      await desktop.openInExplorer(path)
    } catch (error) {
      console.error('Failed to open in explorer:', error)
    }
  }, [])

  const handleRemoveFromHistory = useCallback(async (projectId: string) => {
    const serverState = getLatestServerState(projectId)
    const needsStopBeforeDelete = isServerActive(serverState.status)
    const confirmMessage = needsStopBeforeDelete
      ? 'The project is still running. Confirm to stop it first, then remove it from history.'
      : 'Remove this project from history?'

    let confirmed = false

    try {
      confirmed = await desktop.confirm(confirmMessage, 'Remove project')
    } catch (error) {
      console.error('[App] Failed to open remove confirmation dialog:', error)
      alert('Failed to open confirmation dialog: ' + getErrorMessage(error))
      return
    }

    if (!confirmed) {
      return
    }

    try {
      if (needsStopBeforeDelete) {
        try {
          await stopProjectAndWait(projectId, 'Stopping server before removal...')
        } catch (error) {
          console.error('[App] Failed to stop server before removal:', error)
          alert(
            'Failed to stop server: ' +
            getErrorMessage(error) +
            '\n\nProject will not be removed until it is fully stopped.'
          )
          return
        }
      }

      await desktop.removeFromHistory(projectId)
      await loadHistory()

      if (stateRef.current.selectedProjectId === projectId) {
        setSelectedProject(null)
      }
    } catch (error) {
      console.error('[App] Failed to remove from history:', error)
      alert('Remove failed: ' + getErrorMessage(error))
    }
  }, [getLatestServerState, loadHistory, setSelectedProject, stopProjectAndWait])

  const selectedServerState = useMemo(() => {
    if (!state.selectedProjectId) {
      return null
    }

    return getServerState(state.selectedProjectId)
  }, [getServerState, state.selectedProjectId])

  return (
    <div className="app">
      <Header
        onSelectFolder={handleSelectFolder}
        launchOnStartup={appSettings.launchOnStartup}
        closeToTrayOnClose={appSettings.closeToTrayOnClose}
        onLaunchOnStartupChange={handleLaunchOnStartupChange}
        onCloseToTrayOnCloseChange={handleCloseToTrayOnCloseChange}
      />

      <main className="main">
        {state.selectedFolder && (
          <div className="selected-folder">
            <p>当前目录：{state.selectedFolder}</p>
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
