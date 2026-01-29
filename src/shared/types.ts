/**
 * 共享类型定义
 * 在主进程和渲染进程之间共享的类型
 */

/**
 * 开发服务器配置
 */
export interface DevConfig {
  command: string              // 执行命令 (例如 "npm run dev")
  cwd: string                  // 工作目录
  env?: Record<string, string> // 环境变量
  port?: number                // 端口号（可选）
  name?: string                // 项目名称（可选）
}

/**
 * 项目历史记录条目
 */
export interface ProjectHistoryEntry {
  id: string                   // 唯一标识符（路径的哈希值）
  name: string                 // 项目名称
  path: string                 // 项目目录的绝对路径
  lastLaunched: Date           // 最后启动时间戳
  config: DevConfig            // 缓存的开发配置
}

/**
 * 应用程序设置
 */
export interface AppSettings {
  windowBounds: {
    width: number
    height: number
    x?: number
    y?: number
  }
  theme: 'light' | 'dark' | 'system'
  maxHistoryEntries: number    // 保留的最大历史记录数
}

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

/**
 * 验证错误
 */
export interface ValidationError {
  field: string
  message: string
}

/**
 * 服务器状态
 */
export type ServerStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'error'

/**
 * 服务器进程信息
 */
export interface ServerProcess {
  projectId: string
  pid: number
  status: ServerStatus
  startTime: Date
}

/**
 * 错误消息
 */
export interface ErrorMessage {
  title: string           // 错误标题
  message: string         // 用户友好的描述
  details?: string        // 技术细节（可折叠）
  actions?: ErrorAction[] // 可用操作
}

/**
 * 错误操作
 */
export interface ErrorAction {
  label: string
  handler: () => void
}
