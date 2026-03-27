import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { confirm as confirmDialog, open as openDialog } from '@tauri-apps/plugin-dialog'
import type {
  DevConfig,
  ProjectHistoryEntry,
  ServerProcess,
  ServerStatus,
  ValidationResult,
} from '../../shared/types'

const DESKTOP_EVENTS = {
  serverOutput: 'server-output',
  serverStatusChange: 'server-status-change',
  serverUrlDetected: 'server-url-detected',
} as const

type RemoveListener = () => void

type HistoryEntryPayload = Omit<ProjectHistoryEntry, 'lastLaunched'> & {
  lastLaunched: number | string | Date
}

type ServerOutputPayload = {
  projectId: string
  output: string
}

type ServerStatusPayload = {
  projectId: string
  status: ServerStatus
}

type ServerUrlPayload = {
  projectId: string
  url: string
}

function hasTauriRuntime(): boolean {
  if (import.meta.env.MODE === 'test') {
    return true
  }

  if (typeof window === 'undefined') {
    return true
  }

  const tauriWindow = window as Window & {
    __TAURI__?: unknown
    __TAURI_INTERNALS__?: unknown
  }

  return typeof tauriWindow.__TAURI__ !== 'undefined' || typeof tauriWindow.__TAURI_INTERNALS__ !== 'undefined'
}

function createDesktopOnlyError(action: string): Error {
  return new Error(`${action} 仅在桌面应用中可用。`)
}

function normalizeHistoryEntry(entry: HistoryEntryPayload): ProjectHistoryEntry {
  return {
    ...entry,
    lastLaunched: new Date(entry.lastLaunched),
  }
}

function serializeHistoryEntry(entry: ProjectHistoryEntry): HistoryEntryPayload {
  return {
    ...entry,
    lastLaunched:
      entry.lastLaunched instanceof Date
        ? entry.lastLaunched.getTime()
        : new Date(entry.lastLaunched).getTime(),
  }
}

async function listenServerEvent<TPayload>(
  eventName: string,
  handler: (payload: TPayload) => void
): Promise<RemoveListener> {
  if (!hasTauriRuntime()) {
    return () => undefined
  }

  const unlisten = await listen<TPayload>(eventName, (event) => {
    handler(event.payload)
  })

  return () => {
    unlisten()
  }
}

export const desktop = {
  async selectFolder(): Promise<string | null> {
    if (!hasTauriRuntime()) {
      return null
    }

    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: 'Select project folder',
    })

    if (!selected) {
      return null
    }

    return Array.isArray(selected) ? selected[0] ?? null : selected
  },

  confirm(message: string, title = 'Confirm action'): Promise<boolean> {
    if (!hasTauriRuntime()) {
      return Promise.resolve(typeof window !== 'undefined' ? window.confirm(message) : false)
    }

    return confirmDialog(message, { title, kind: 'warning' })
  },

  loadConfig(projectPath: string): Promise<DevConfig> {
    if (!hasTauriRuntime()) {
      return Promise.reject(createDesktopOnlyError('加载项目配置'))
    }

    return invoke<DevConfig>('load_config', { projectPath })
  },

  validateConfig(config: DevConfig): Promise<ValidationResult> {
    if (!hasTauriRuntime()) {
      return Promise.reject(createDesktopOnlyError('校验项目配置'))
    }

    return invoke<ValidationResult>('validate_config', { config })
  },

  startServer(
    projectId: string,
    projectPath: string,
    config: DevConfig
  ): Promise<ServerProcess> {
    if (!hasTauriRuntime()) {
      return Promise.reject(createDesktopOnlyError('启动服务'))
    }

    return invoke<ServerProcess>('start_server', {
      projectId,
      projectPath,
      config,
    })
  },

  stopServer(projectId: string): Promise<void> {
    if (!hasTauriRuntime()) {
      return Promise.reject(createDesktopOnlyError('停止服务'))
    }

    return invoke<void>('stop_server', { projectId })
  },

  getServerStatus(projectId: string): Promise<ServerStatus> {
    if (!hasTauriRuntime()) {
      return Promise.resolve('stopped')
    }

    return invoke<ServerStatus>('get_server_status', { projectId })
  },

  async loadHistory(): Promise<ProjectHistoryEntry[]> {
    if (!hasTauriRuntime()) {
      return []
    }

    const history = await invoke<HistoryEntryPayload[]>('load_history')
    return history.map(normalizeHistoryEntry)
  },

  addToHistory(entry: ProjectHistoryEntry): Promise<void> {
    if (!hasTauriRuntime()) {
      return Promise.reject(createDesktopOnlyError('保存项目历史'))
    }

    return invoke<void>('add_to_history', {
      entry: serializeHistoryEntry(entry),
    })
  },

  removeFromHistory(projectId: string): Promise<void> {
    if (!hasTauriRuntime()) {
      return Promise.reject(createDesktopOnlyError('移除项目历史'))
    }

    return invoke<void>('remove_from_history', { projectId })
  },

  clearHistory(): Promise<void> {
    if (!hasTauriRuntime()) {
      return Promise.reject(createDesktopOnlyError('清空项目历史'))
    }

    return invoke<void>('clear_history')
  },

  openInExplorer(pathOrUrl: string): Promise<void> {
    if (!hasTauriRuntime()) {
      if (typeof window !== 'undefined' && /^https?:\/\//i.test(pathOrUrl)) {
        window.open(pathOrUrl, '_blank', 'noopener,noreferrer')
      }

      return Promise.resolve()
    }

    return invoke<void>('open_in_explorer', { pathOrUrl })
  },

  checkPathExists(path: string): Promise<boolean> {
    if (!hasTauriRuntime()) {
      return Promise.resolve(false)
    }

    return invoke<boolean>('check_path_exists', { filePath: path })
  },

  onServerOutput(callback: (projectId: string, output: string) => void): Promise<RemoveListener> {
    return listenServerEvent<ServerOutputPayload>(DESKTOP_EVENTS.serverOutput, (payload) => {
      callback(payload.projectId, payload.output)
    })
  },

  onServerStatusChange(
    callback: (projectId: string, status: ServerStatus) => void
  ): Promise<RemoveListener> {
    return listenServerEvent<ServerStatusPayload>(DESKTOP_EVENTS.serverStatusChange, (payload) => {
      callback(payload.projectId, payload.status)
    })
  },

  onServerUrlDetected(callback: (projectId: string, url: string) => void): Promise<RemoveListener> {
    return listenServerEvent<ServerUrlPayload>(DESKTOP_EVENTS.serverUrlDetected, (payload) => {
      callback(payload.projectId, payload.url)
    })
  },
}
