import type {
  AppSettings,
  DevConfig,
  ProjectHistoryEntry,
  ServerProcess,
  ServerStatus,
  ValidationResult,
} from '../../shared/types'
import type { GoApp, HistoryEntryPayload, WailsRuntime } from '../../wails-runtime'

const DESKTOP_EVENTS = {
  serverOutput: 'server-output',
  serverStatusChange: 'server-status-change',
  serverUrlDetected: 'server-url-detected',
} as const

type RemoveListener = () => void

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

function createDesktopOnlyError(action: string): Error {
  return new Error(`${action} 仅在桌面应用中可用。`)
}

/**
 * 返回 Wails 绑定的 Go App，若运行时不可用（如浏览器测试环境）返回 null。
 */
function getApp(): GoApp | null {
  if (typeof window === 'undefined') {
    return null
  }
  return window.go?.main?.App ?? null
}

/**
 * 返回 Wails runtime 全局对象，若不可用返回 null。
 */
function getRuntime(): WailsRuntime | null {
  if (typeof window === 'undefined') {
    return null
  }
  return window.runtime ?? null
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

/**
 * 订阅后端事件；运行时不可用时返回空的取消函数。
 * Wails 事件载荷作为可变参数传入，这里取第一个参数。
 */
function listenServerEvent<TPayload>(
  eventName: string,
  handler: (payload: TPayload) => void
): Promise<RemoveListener> {
  const runtime = getRuntime()
  if (!runtime) {
    return Promise.resolve(() => undefined)
  }

  const unlisten = runtime.EventsOn(eventName, (...data: unknown[]) => {
    handler(data[0] as TPayload)
  })

  return Promise.resolve(() => {
    unlisten()
  })
}

export const desktop = {
  async selectFolder(): Promise<string | null> {
    const app = getApp()
    if (!app) {
      return null
    }

    const selected = await app.SelectFolder()
    return selected === '' ? null : selected
  },

  confirm(message: string, title = '确认操作'): Promise<boolean> {
    const app = getApp()
    if (!app) {
      return Promise.resolve(typeof window !== 'undefined' ? window.confirm(message) : false)
    }

    return app.Confirm(message, title)
  },

  minimiseWindow(): Promise<void> {
    const app = getApp()
    if (!app) {
      return Promise.resolve()
    }

    return app.MinimiseWindow()
  },

  toggleMaximiseWindow(): Promise<void> {
    const app = getApp()
    if (!app) {
      return Promise.resolve()
    }

    return app.ToggleMaximiseWindow()
  },

  closeWindow(): Promise<void> {
    const app = getApp()
    if (!app) {
      return Promise.resolve()
    }

    return app.CloseWindow()
  },

  loadConfig(projectPath: string): Promise<DevConfig> {
    const app = getApp()
    if (!app) {
      return Promise.reject(createDesktopOnlyError('加载项目配置'))
    }

    return app.LoadConfig(projectPath)
  },

  validateConfig(config: DevConfig): Promise<ValidationResult> {
    const app = getApp()
    if (!app) {
      return Promise.reject(createDesktopOnlyError('校验项目配置'))
    }

    return app.ValidateConfig(config)
  },

  startServer(
    projectId: string,
    projectPath: string,
    config: DevConfig
  ): Promise<ServerProcess> {
    const app = getApp()
    if (!app) {
      return Promise.reject(createDesktopOnlyError('启动服务'))
    }

    return app.StartServer(projectId, projectPath, config)
  },

  stopServer(projectId: string): Promise<void> {
    const app = getApp()
    if (!app) {
      return Promise.reject(createDesktopOnlyError('停止服务'))
    }

    return app.StopServer(projectId)
  },

  getServerStatus(projectId: string): Promise<ServerStatus> {
    const app = getApp()
    if (!app) {
      return Promise.resolve('stopped')
    }

    return app.GetServerStatus(projectId)
  },

  async loadHistory(): Promise<ProjectHistoryEntry[]> {
    const app = getApp()
    if (!app) {
      return []
    }

    const history = await app.LoadHistory()
    return history.map(normalizeHistoryEntry)
  },

  addToHistory(entry: ProjectHistoryEntry): Promise<void> {
    const app = getApp()
    if (!app) {
      return Promise.reject(createDesktopOnlyError('保存项目历史'))
    }

    return app.AddToHistory(serializeHistoryEntry(entry))
  },

  removeFromHistory(projectId: string): Promise<void> {
    const app = getApp()
    if (!app) {
      return Promise.reject(createDesktopOnlyError('移除项目历史'))
    }

    return app.RemoveFromHistory(projectId)
  },

  clearHistory(): Promise<void> {
    const app = getApp()
    if (!app) {
      return Promise.reject(createDesktopOnlyError('清空项目历史'))
    }

    return app.ClearHistory()
  },

  loadSettings(): Promise<AppSettings> {
    const app = getApp()
    if (!app) {
      return Promise.resolve({
        windowBounds: {
          width: 1200,
          height: 800,
        },
        theme: 'system',
        maxHistoryEntries: 50,
        launchOnStartup: false,
        closeToTrayOnClose: false,
      })
    }

    return app.LoadSettings()
  },

  saveSettings(settings: AppSettings): Promise<AppSettings> {
    const app = getApp()
    if (!app) {
      return Promise.resolve(settings)
    }

    return app.SaveSettings(settings)
  },

  openInExplorer(pathOrUrl: string): Promise<void> {
    const app = getApp()
    if (!app) {
      if (typeof window !== 'undefined' && /^https?:\/\//i.test(pathOrUrl)) {
        window.open(pathOrUrl, '_blank', 'noopener,noreferrer')
      }

      return Promise.resolve()
    }

    return app.OpenInExplorer(pathOrUrl)
  },

  checkPathExists(path: string): Promise<boolean> {
    const app = getApp()
    if (!app) {
      return Promise.resolve(false)
    }

    return app.CheckPathExists(path)
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
