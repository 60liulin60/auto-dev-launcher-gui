/**
 * 渲染进程类型定义
 */

import {
  DevConfig,
  ProjectHistoryEntry,
  RuntimePreview,
  ServerStatus,
} from '../../shared/types'

export type { DevConfig, ProjectHistoryEntry, RuntimePreview, ServerStatus }

/**
 * 服务器状态信息
 */
export interface ServerState {
  status: ServerStatus
  output: string[]
  detectedUrl?: string
  /** 进程退出码（completed / error 时提供）。 */
  exitCode?: number
  /** 进程运行时长（毫秒）。 */
  durationMs?: number
  /** 实际使用的 Node 版本。 */
  runtime?: string
  /** 运行时来源。 */
  runtimeSource?: string
  /** 运行时解析提示。 */
  runtimeNote?: string
  /** 启动失败原因（startServer 拒绝时由后端 message 填充）。 */
  errorMessage?: string
}

/**
 * 应用程序状态
 */
export interface AppState {
  projects: ProjectHistoryEntry[]
  serverStates: Map<string, ServerState>
  selectedProjectId: string | null
  selectedFolder: string | null
  isLoading: boolean
  error: string | null
}

/**
 * 应用程序动作类型
 */
export type AppAction =
  | { type: 'LOAD_PROJECTS'; payload: ProjectHistoryEntry[] }
  | { type: 'ADD_PROJECT'; payload: ProjectHistoryEntry }
  | { type: 'REMOVE_PROJECT'; payload: string }
  | { type: 'UPDATE_PROJECT'; payload: { id: string; updates: Partial<ProjectHistoryEntry> } }
  | { type: 'SET_SELECTED_PROJECT'; payload: string | null }
  | { type: 'SET_SELECTED_FOLDER'; payload: string | null }
  | { type: 'UPDATE_SERVER_STATE'; payload: { projectId: string; state: ServerState } }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }

/**
 * 组件属性接口
 */

/**
 * 项目卡片组件属性
 */
export interface ProjectCardProps {
  project: ProjectHistoryEntry
  serverState: ServerState
  isSelected: boolean
  onSelect: (projectId: string) => void
  onLaunch: (project: ProjectHistoryEntry) => void
  onStop: (projectId: string) => void
  onEdit: (projectId: string) => void
  onOpenInExplorer: (path: string) => void
  onRemove: (projectId: string) => void
}

/**
 * 项目列表组件属性
 */
export interface ProjectListProps {
  projects: ProjectHistoryEntry[]
  serverStates: Map<string, ServerState>
  selectedProjectId: string | null
  onProjectSelect: (projectId: string) => void
  onProjectLaunch: (project: ProjectHistoryEntry) => void
  onProjectStop: (projectId: string) => void
  onProjectEdit: (projectId: string) => void
  onProjectOpen: (path: string) => void
  onProjectRemove: (projectId: string) => void
}

/**
 * 项目设置保存内容
 */
export interface ProjectSettingsUpdate {
  runtimeOverride?: string
  config?: DevConfig
}

/**
 * 新增脚本项目草稿
 */
export interface ScriptProjectDraft {
  path: string
  name: string
  config: DevConfig
}

/**
 * 输出控制台组件属性
 */
export interface OutputConsoleProps {
  projectId: string | null
  serverState: ServerState | null
}

/**
 * 头部组件属性
 */
export interface HeaderProps {
  onSelectFolder: () => void
  isLoading?: boolean
  launchOnStartup: boolean
  closeToTrayOnClose: boolean
  onLaunchOnStartupChange: (enabled: boolean) => void
  onCloseToTrayOnCloseChange: (enabled: boolean) => void
}

/**
 * 输出行组件属性
 */
export interface OutputLineProps {
  line: string
  index: number
}

/**
 * 状态徽章组件属性
 */
export interface StatusBadgeProps {
  status: ServerStatus
}

/**
 * 按钮组件属性
 */
export interface ButtonProps {
  onClick: (e?: React.MouseEvent) => void
  disabled?: boolean
  className?: string
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger'
}

/**
 * 确认对话框配置
 */
export interface ConfirmDialogConfig {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel?: () => void
}

/**
 * 工具函数类型
 */

/**
 * 状态文本获取函数
 */
export type GetStatusText = (status: ServerStatus) => string

/**
 * 状态颜色获取函数
 */
export type GetStatusColor = (status: ServerStatus) => string

/**
 * URL检测函数
 */
export type IsUrl = (text: string) => boolean

/**
 * 路径清理函数
 */
export type SanitizePath = (path: string) => string

/**
 * 项目ID生成函数
 */
export type GenerateProjectId = (path: string) => string
