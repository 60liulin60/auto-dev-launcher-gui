/**
 * 应用程序常量
 */

import * as path from 'path'
import * as os from 'os'

/**
 * 获取平台特定的存储路径
 */
export function getStoragePath(): string {
  const platform = process.platform
  const appName = 'auto-dev-launcher-gui'
  
  switch (platform) {
    case 'win32':
      return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), appName)
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', appName)
    case 'linux':
      return path.join(os.homedir(), '.config', appName)
    default:
      return path.join(os.homedir(), `.${appName}`)
  }
}

/**
 * 默认窗口尺寸
 */
export const DEFAULT_WINDOW_BOUNDS = {
  width: 1200,
  height: 800,
}

/**
 * 存储文件名
 */
export const STORAGE_FILES = {
  HISTORY: 'project-history.json',
  SETTINGS: 'app-settings.json',
}

/**
 * 默认应用设置
 */
export const DEFAULT_SETTINGS = {
  windowBounds: DEFAULT_WINDOW_BOUNDS,
  theme: 'system' as const,
  maxHistoryEntries: 50,
}

/**
 * 验证规则
 */
export const VALIDATION_RULES = {
  REQUIRED_FIELDS: ['command', 'cwd'],
  MAX_PATH_LENGTH: 260, // Windows 路径长度限制
}

/**
 * 错误消息
 */
export const ERROR_MESSAGES = {
  CONFIG_NOT_FOUND: '未找到 dev-config.json 文件',
  CONFIG_INVALID_JSON: '配置文件不是有效的 JSON 格式',
  CONFIG_MISSING_FIELD: (field: string) => `配置文件缺少必需字段: ${field}`,
  PATH_NOT_EXIST: (path: string) => `路径不存在: ${path}`,
  SERVER_START_FAILED: '服务器启动失败',
  SERVER_ALREADY_RUNNING: '服务器已在运行',
}

/**
 * IPC 通道名称
 */
export const IPC_CHANNELS = {
  // 项目操作
  PROJECT_SELECT_FOLDER: 'project:select-folder',
  PROJECT_LOAD_CONFIG: 'project:load-config',
  PROJECT_VALIDATE_CONFIG: 'project:validate-config',
  
  // 服务器操作
  SERVER_START: 'server:start',
  SERVER_STOP: 'server:stop',
  SERVER_GET_STATUS: 'server:get-status',
  SERVER_OUTPUT: 'server:output',
  SERVER_STATUS_CHANGE: 'server:status-change',
  
  // 历史记录操作
  HISTORY_LOAD: 'history:load',
  HISTORY_ADD: 'history:add',
  HISTORY_REMOVE: 'history:remove',
  HISTORY_CLEAR: 'history:clear',
  
  // 文件系统操作
  FS_OPEN_IN_EXPLORER: 'fs:open-in-explorer',
  FS_CHECK_PATH_EXISTS: 'fs:check-path-exists',
}
