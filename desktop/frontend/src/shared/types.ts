/**
 * 共享类型定义
 * 在主进程和渲染进程之间共享的类型
 */

/**
 * 项目类型：node 为常规 Node 项目，script 为批处理脚本（.bat/.cmd）。
 */
export type ProjectKind = 'node' | 'script'

/**
 * 开发服务器配置
 */
export interface DevConfig {
  /** 项目类型：node（默认）或 script（批处理脚本）。旧配置缺省视为 node。 */
  kind?: ProjectKind
  /** 启动命令；script 类型时为 .bat/.cmd 脚本路径。 */
  command: string
  /** 工作目录；script 类型缺省为脚本所在目录。 */
  cwd: string
  /** 额外环境变量。 */
  env?: Record<string, string>
  /** 期望端口。 */
  port?: number
  /** 展示名称。 */
  name?: string
  /** 配置中显式声明的 Node 版本（优先级最高）。 */
  runtime?: string
  /** 额外启动参数，原样追加在命令之后。 */
  args?: string
}

export interface ProjectHistoryEntry {
  id: string
  name: string
  path: string
  lastLaunched: Date
  config: DevConfig
  /** 用户为该条目选择的运行时覆盖；空串表示自动。 */
  runtimeOverride?: string
}

export interface AppSettings {
  windowBounds: {
    width: number
    height: number
    x?: number
    y?: number
  }
  theme: 'light' | 'dark' | 'system'
  maxHistoryEntries: number
  launchOnStartup: boolean
  closeToTrayOnClose: boolean
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

export interface ValidationError {
  field: string
  message: string
}

export type ServerStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'completed' | 'error'

export interface ServerProcess {
  projectId: string
  pid: number
  status: ServerStatus
  startTime: Date
  /** 进程退出码（completed / error 时提供）。 */
  exitCode?: number
  /** 进程运行时长（毫秒）。 */
  durationMs?: number
  /** 实际使用的 Node 版本，例如 18.20.4。 */
  runtime?: string
  /** 运行时来源，例如 .nvmrc、历史设置、系统默认。 */
  runtimeSource?: string
  /** 运行时解析提示，例如声明无法解析时的说明。 */
  runtimeNote?: string
}

export interface RuntimeOption {
  version: string
  dir: string
  source: string
  label: string
}

export interface RuntimePreview {
  version: string
  label: string
  source: string
  note?: string
  /** 项目声明或覆盖的版本在本机未安装。 */
  missing: boolean
  requested?: string
  available?: string[]
}

export interface ServerStatusChangePayload {
  projectId: string
  status: ServerStatus
  exitCode?: number
  durationMs?: number
  runtime?: string
  runtimeSource?: string
  runtimeNote?: string
}

export interface ErrorMessage {
  title: string
  message: string
  details?: string
  actions?: ErrorAction[]
}

export interface ErrorAction {
  label: string
  handler: () => void
}
