/**
 * IPC 处理器
 * 处理渲染进程和主进程之间的通信
 */

import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { StorageManager } from './storage'
import { ProcessManager } from './process-manager'
import { validateDevConfig, parseDevConfig } from './validation'
import { IPC_CHANNELS, ERROR_MESSAGES } from '../shared/constants'
import { ProjectHistoryEntry, DevConfig } from '../shared/types'

export function setupIPCHandlers(
  storage: StorageManager,
  processManager: ProcessManager,
  mainWindow: BrowserWindow
) {
  // ==================== 项目操作 ====================
  
  /**
   * 选择文件夹
   */
  ipcMain.handle(IPC_CHANNELS.PROJECT_SELECT_FOLDER, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择项目目录',
    })
    
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    
    return result.filePaths[0]
  })

  /**
   * 加载项目配置
   * 优先读取 dev-config.json，如果不存在则自动从 package.json 生成配置
   */
  ipcMain.handle(IPC_CHANNELS.PROJECT_LOAD_CONFIG, async (_, projectPath: string) => {
    try {
      const configPath = path.join(projectPath, 'dev-config.json')
      const packageJsonPath = path.join(projectPath, 'package.json')
      
      // 优先尝试读取 dev-config.json
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8')
        const config = parseDevConfig(content)
        
        if (!config) {
          throw new Error(ERROR_MESSAGES.CONFIG_INVALID_JSON)
        }
        
        return config
      }
      
      // 如果没有 dev-config.json，尝试从 package.json 自动生成配置
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
        const scripts = packageJson.scripts || {}
        
        // 自动检测启动命令（优先级：dev > start > serve）
        let startCommand = 'start'
        if (scripts.dev) {
          startCommand = 'dev'
        } else if (scripts.start) {
          startCommand = 'start'
        } else if (scripts.serve) {
          startCommand = 'serve'
        }
        
        // 自动检测包管理器
        let packageManager = 'npm'
        if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) {
          packageManager = 'pnpm'
        } else if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) {
          packageManager = 'yarn'
        }
        
        // 生成配置
        const autoConfig: DevConfig = {
          name: packageJson.name || path.basename(projectPath),
          command: `${packageManager} run ${startCommand}`,
          cwd: projectPath
        }
        
        return autoConfig
      }
      
      throw new Error('未找到 dev-config.json 或 package.json 文件')
    } catch (error) {
      throw error
    }
  })

  /**
   * 验证项目配置
   */
  ipcMain.handle(IPC_CHANNELS.PROJECT_VALIDATE_CONFIG, async (_, config: DevConfig) => {
    return validateDevConfig(config)
  })

  // ==================== 服务器操作 ====================
  
  /**
   * 启动服务器
   */
  ipcMain.handle(IPC_CHANNELS.SERVER_START, async (_, projectId: string, projectPath: string, config: DevConfig) => {
    try {
      const processInfo = await processManager.startServer(projectId, projectPath, config)
      return processInfo
    } catch (error) {
      throw error
    }
  })

  /**
   * 停止服务器
   */
  ipcMain.handle(IPC_CHANNELS.SERVER_STOP, async (_, projectId: string) => {
    try {
      await processManager.stopServer(projectId)
    } catch (error) {
      throw error
    }
  })

  /**
   * 获取服务器状态
   */
  ipcMain.handle(IPC_CHANNELS.SERVER_GET_STATUS, async (_, projectId: string) => {
    return processManager.getServerStatus(projectId)
  })

  // 监听进程输出并转发到渲染进程
  processManager.on('output', (projectId: string, output: string) => {
    mainWindow.webContents.send(IPC_CHANNELS.SERVER_OUTPUT, projectId, output)
  })

  // 监听状态变化并转发到渲染进程
  processManager.on('status-change', (projectId: string, status: string) => {
    mainWindow.webContents.send('server:status-change', projectId, status)
  })

  // ==================== 历史记录操作 ====================
  
  /**
   * 加载项目历史
   */
  ipcMain.handle(IPC_CHANNELS.HISTORY_LOAD, async () => {
    return await storage.loadProjectHistory()
  })

  /**
   * 添加项目到历史
   */
  ipcMain.handle(IPC_CHANNELS.HISTORY_ADD, async (_, entry: ProjectHistoryEntry) => {
    const history = await storage.loadProjectHistory()
    
    // 检查是否已存在
    const existingIndex = history.findIndex(item => item.id === entry.id)
    
    if (existingIndex >= 0) {
      // 更新现有条目
      history[existingIndex] = {
        ...history[existingIndex],
        ...entry,
        lastLaunched: new Date(),
      }
    } else {
      // 添加新条目
      history.push({
        ...entry,
        lastLaunched: new Date(),
      })
    }
    
    await storage.saveProjectHistory(history)
  })

  /**
   * 从历史中移除项目
   */
  ipcMain.handle(IPC_CHANNELS.HISTORY_REMOVE, async (_, projectId: string) => {
    const history = await storage.loadProjectHistory()
    const filtered = history.filter(item => item.id !== projectId)
    await storage.saveProjectHistory(filtered)
  })

  /**
   * 清除所有历史
   */
  ipcMain.handle(IPC_CHANNELS.HISTORY_CLEAR, async () => {
    await storage.saveProjectHistory([])
  })

  // ==================== 文件系统操作 ====================
  
  /**
   * 在文件管理器中打开或在浏览器中打开 URL
   */
  ipcMain.handle(IPC_CHANNELS.FS_OPEN_IN_EXPLORER, async (_, pathOrUrl: string) => {
    try {
      // 检查是否是 URL
      if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
        // 在默认浏览器中打开 URL
        await shell.openExternal(pathOrUrl)
      } else {
        // 在文件管理器中打开路径
        await shell.openPath(pathOrUrl)
      }
    } catch (error) {
      throw error
    }
  })

  /**
   * 检查路径是否存在
   */
  ipcMain.handle(IPC_CHANNELS.FS_CHECK_PATH_EXISTS, async (_, filePath: string) => {
    return fs.existsSync(filePath)
  })
}
