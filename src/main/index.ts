/**
 * Electron 主进程入口
 */

import { app, BrowserWindow } from 'electron'
import * as path from 'path'
import { StorageManager } from './storage'
import { ProcessManager } from './process-manager'
import { setupIPCHandlers } from './ipc-handlers'
import { DEFAULT_WINDOW_BOUNDS } from '../shared/constants'

let mainWindow: BrowserWindow | null = null
const storage = new StorageManager()
const processManager = new ProcessManager()

/**
 * 创建主窗口
 */
async function createWindow() {
  // 加载保存的窗口尺寸
  const settings = await storage.loadSettings()
  
  // 设置图标路径 - Windows 使用 ICO 格式以获得最佳兼容性
  let iconPath: string
  
  if (app.isPackaged) {
    // 生产环境：图标在 resources 目录下
    iconPath = path.join(process.resourcesPath, 'build', 'icon.ico')
  } else {
    // 开发环境：图标在项目根目录的 build 文件夹
    iconPath = path.join(__dirname, '../../build/icon.ico')
  }
  
  console.log('Environment:', app.isPackaged ? 'Production' : 'Development')
  console.log('Icon path:', iconPath)
  console.log('Icon exists:', require('fs').existsSync(iconPath))
  
  mainWindow = new BrowserWindow({
    width: settings.windowBounds.width || DEFAULT_WINDOW_BOUNDS.width,
    height: settings.windowBounds.height || DEFAULT_WINDOW_BOUNDS.height,
    x: settings.windowBounds.x,
    y: settings.windowBounds.y,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // 在开发模式下禁用webSecurity以避免CSP警告
      webSecurity: process.env.NODE_ENV === 'production',
      // 只在开发模式下允许不安全内容，避免警告
      allowRunningInsecureContent: process.env.NODE_ENV === 'development',
    },
    title: '自动开发服务器启动工具',
    show: false, // 先不显示，等加载完成后再显示
    autoHideMenuBar: true, // 自动隐藏菜单栏
  })
  
  // 完全移除菜单栏
  mainWindow.setMenuBarVisibility(false)

  // 设置 IPC 处理器
  setupIPCHandlers(storage, processManager, mainWindow)

  // 加载渲染进程
  if (process.env.NODE_ENV === 'development') {
    // 开发模式：加载 Vite 开发服务器
    mainWindow.loadURL('http://localhost:5173')
  } else {
    // 生产模式：加载打包后的文件
    const indexPath = path.join(__dirname, '../renderer/index.html')
    mainWindow.loadFile(indexPath)
  }

  // 总是打开开发者工具以便调试
  mainWindow.webContents.openDevTools()

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show()
      
      // 在 Windows 上，确保任务栏图标正确显示
      if (process.platform === 'win32') {
        mainWindow.setIcon(iconPath)
      }
    }
  })

  // 保存窗口尺寸
  mainWindow.on('close', async (event) => {
    if (mainWindow) {
      // 阻止默认关闭行为
      event.preventDefault()
      
      // 保存窗口尺寸
      const bounds = mainWindow.getBounds()
      const settings = await storage.loadSettings()
      settings.windowBounds = bounds
      await storage.saveSettings(settings)
      
      // 停止所有运行中的服务器
      try {
        await processManager.stopAllServers()
      } catch (error) {
        console.error('Failed to stop servers on close:', error)
      }
      
      // 现在可以真正关闭窗口了
      mainWindow.destroy()
    }
  })

  // 窗口关闭时清理
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/**
 * 应用准备就绪
 */
app.whenReady().then(async () => {
  // 设置 Windows 应用程序用户模型 ID
  // 这对于任务栏图标显示很重要
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.autodevlauncher.gui');
  }
  
  await createWindow()

  app.on('activate', () => {
    // macOS: 点击 Dock 图标时重新创建窗口
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

/**
 * 所有窗口关闭
 */
app.on('window-all-closed', async () => {
  // 停止所有服务器
  await processManager.stopAllServers()
  
  // macOS: 除非用户明确退出，否则保持应用运行
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

/**
 * 应用退出前
 */
app.on('before-quit', async () => {
  // 停止所有服务器
  await processManager.stopAllServers()
})
