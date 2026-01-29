/**
 * Preload 脚本
 * 安全地暴露 API 给渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron'

// 直接定义 IPC 通道常量（避免导入问题）
const IPC_CHANNELS = {
  PROJECT_SELECT_FOLDER: 'project:select-folder',
  PROJECT_LOAD_CONFIG: 'project:load-config',
  PROJECT_VALIDATE_CONFIG: 'project:validate-config',
  SERVER_START: 'server:start',
  SERVER_STOP: 'server:stop',
  SERVER_GET_STATUS: 'server:get-status',
  SERVER_OUTPUT: 'server:output',
  SERVER_STATUS_CHANGE: 'server:status-change',
  HISTORY_LOAD: 'history:load',
  HISTORY_ADD: 'history:add',
  HISTORY_REMOVE: 'history:remove',
  HISTORY_CLEAR: 'history:clear',
  FS_OPEN_IN_EXPLORER: 'fs:open-in-explorer',
  FS_CHECK_PATH_EXISTS: 'fs:check-path-exists',
}

// 暴露 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 项目操作
  selectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SELECT_FOLDER),
  loadConfig: (projectPath: string) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LOAD_CONFIG, projectPath),
  validateConfig: (config: any) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_VALIDATE_CONFIG, config),
  
  // 服务器操作
  startServer: (projectId: string, projectPath: string, config: any) => 
    ipcRenderer.invoke(IPC_CHANNELS.SERVER_START, projectId, projectPath, config),
  stopServer: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.SERVER_STOP, projectId),
  getServerStatus: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.SERVER_GET_STATUS, projectId),
  onServerOutput: (callback: (projectId: string, output: string) => void) => {
    ipcRenderer.on(IPC_CHANNELS.SERVER_OUTPUT, (_, projectId, output) => callback(projectId, output))
  },
  onServerStatusChange: (callback: (projectId: string, status: string) => void) => {
    ipcRenderer.on('server:status-change', (_, projectId, status) => callback(projectId, status))
  },
  
  // 历史记录操作
  loadHistory: () => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_LOAD),
  addToHistory: (entry: any) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_ADD, entry),
  removeFromHistory: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_REMOVE, projectId),
  clearHistory: () => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_CLEAR),
  
  // 文件系统操作
  openInExplorer: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.FS_OPEN_IN_EXPLORER, path),
  checkPathExists: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.FS_CHECK_PATH_EXISTS, path),
})

// 类型声明（供 TypeScript 使用）
declare global {
  interface Window {
    electronAPI: {
      selectFolder: () => Promise<string | null>
      loadConfig: (projectPath: string) => Promise<any>
      validateConfig: (config: any) => Promise<any>
      startServer: (projectId: string, projectPath: string, config: any) => Promise<any>
      stopServer: (projectId: string) => Promise<void>
      getServerStatus: (projectId: string) => Promise<string>
      onServerOutput: (callback: (projectId: string, output: string) => void) => void
      onServerStatusChange: (callback: (projectId: string, status: string) => void) => void
      loadHistory: () => Promise<any[]>
      addToHistory: (entry: any) => Promise<void>
      removeFromHistory: (projectId: string) => Promise<void>
      clearHistory: () => Promise<void>
      openInExplorer: (path: string) => Promise<void>
      checkPathExists: (path: string) => Promise<boolean>
    }
  }
}
