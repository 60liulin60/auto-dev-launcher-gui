import type {
  AppSettings,
  DevConfig,
  ProjectHistoryEntry,
  ServerProcess,
  ServerStatus,
  ValidationResult,
} from './shared/types'

/**
 * Wails 后端历史条目载荷：lastLaunched 以毫秒时间戳（number）在 IPC 上传输，
 * 前端再规范化为 Date。
 */
export interface HistoryEntryPayload
  extends Omit<ProjectHistoryEntry, 'lastLaunched'> {
  lastLaunched: number
}

/**
 * Go App 结构体导出的方法（由 Wails 绑定到 window.go.main.App）。
 * 参数为位置参数，与 desktop/app.go 保持一致。
 */
export interface GoApp {
  LoadConfig(projectPath: string): Promise<DevConfig>
  ValidateConfig(config: DevConfig): Promise<ValidationResult>
  StartServer(
    projectId: string,
    projectPath: string,
    config: DevConfig
  ): Promise<ServerProcess>
  StopServer(projectId: string): Promise<void>
  GetServerStatus(projectId: string): Promise<ServerStatus>
  LoadHistory(): Promise<HistoryEntryPayload[]>
  AddToHistory(entry: HistoryEntryPayload): Promise<void>
  RemoveFromHistory(projectId: string): Promise<void>
  ClearHistory(): Promise<void>
  OpenInExplorer(pathOrURL: string): Promise<void>
  CheckPathExists(filePath: string): Promise<boolean>
  LoadSettings(): Promise<AppSettings>
  SaveSettings(settings: AppSettings): Promise<AppSettings>
  SelectFolder(): Promise<string>
  Confirm(message: string, title: string): Promise<boolean>
  MinimiseWindow(): Promise<void>
  ToggleMaximiseWindow(): Promise<void>
  CloseWindow(): Promise<void>
}

/**
 * Wails runtime 全局对象（部分，仅声明本项目使用的事件 API）。
 */
export interface WailsRuntime {
  EventsOn(eventName: string, callback: (...data: unknown[]) => void): () => void
  EventsOff(eventName: string, ...additionalEventNames: string[]): void
  EventsEmit(eventName: string, ...data: unknown[]): void
}

declare global {
  interface Window {
    go?: {
      main?: {
        App?: GoApp
      }
    }
    runtime?: WailsRuntime
  }
}
