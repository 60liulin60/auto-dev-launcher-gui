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
  const unlisten = await listen<TPayload>(eventName, (event) => {
    handler(event.payload)
  })

  return () => {
    unlisten()
  }
}

export const desktop = {
  async selectFolder(): Promise<string | null> {
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
    return confirmDialog(message, { title, kind: 'warning' })
  },

  loadConfig(projectPath: string): Promise<DevConfig> {
    return invoke<DevConfig>('load_config', { projectPath })
  },

  validateConfig(config: DevConfig): Promise<ValidationResult> {
    return invoke<ValidationResult>('validate_config', { config })
  },

  startServer(
    projectId: string,
    projectPath: string,
    config: DevConfig
  ): Promise<ServerProcess> {
    return invoke<ServerProcess>('start_server', {
      projectId,
      projectPath,
      config,
    })
  },

  stopServer(projectId: string): Promise<void> {
    return invoke<void>('stop_server', { projectId })
  },

  getServerStatus(projectId: string): Promise<ServerStatus> {
    return invoke<ServerStatus>('get_server_status', { projectId })
  },

  async loadHistory(): Promise<ProjectHistoryEntry[]> {
    const history = await invoke<HistoryEntryPayload[]>('load_history')
    return history.map(normalizeHistoryEntry)
  },

  addToHistory(entry: ProjectHistoryEntry): Promise<void> {
    return invoke<void>('add_to_history', {
      entry: serializeHistoryEntry(entry),
    })
  },

  removeFromHistory(projectId: string): Promise<void> {
    return invoke<void>('remove_from_history', { projectId })
  },

  clearHistory(): Promise<void> {
    return invoke<void>('clear_history')
  },

  openInExplorer(pathOrUrl: string): Promise<void> {
    return invoke<void>('open_in_explorer', { pathOrUrl })
  },

  checkPathExists(path: string): Promise<boolean> {
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