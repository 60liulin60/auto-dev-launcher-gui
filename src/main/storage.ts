/**
 * 存储管理器
 * 负责持久化存储项目历史和应用设置
 */

import * as fs from 'fs'
import * as path from 'path'
import { ProjectHistoryEntry, AppSettings } from '../shared/types'
import { getStoragePath, STORAGE_FILES, DEFAULT_SETTINGS } from '../shared/constants'

export class StorageManager {
  private storagePath: string

  constructor() {
    this.storagePath = getStoragePath()
    this.ensureStorageDirectory()
  }

  /**
   * 获取存储路径
   */
  getStoragePath(): string {
    return this.storagePath
  }

  /**
   * 确保存储目录存在
   */
  private ensureStorageDirectory(): void {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true })
    }
  }

  /**
   * 加载项目历史
   */
  async loadProjectHistory(): Promise<ProjectHistoryEntry[]> {
    const filePath = path.join(this.storagePath, STORAGE_FILES.HISTORY)
    
    try {
      if (!fs.existsSync(filePath)) {
        return []
      }

      const content = fs.readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content)
      
      // 转换日期字符串为 Date 对象
      return data.map((entry: any) => ({
        ...entry,
        lastLaunched: new Date(entry.lastLaunched),
      }))
    } catch (error) {
      console.error('Failed to load project history:', error)
      return []
    }
  }

  /**
   * 保存项目历史
   */
  async saveProjectHistory(history: ProjectHistoryEntry[]): Promise<void> {
    const filePath = path.join(this.storagePath, STORAGE_FILES.HISTORY)
    
    try {
      const content = JSON.stringify(history, null, 2)
      fs.writeFileSync(filePath, content, 'utf-8')
    } catch (error) {
      console.error('Failed to save project history:', error)
      throw new Error(`无法保存项目历史: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 加载应用设置
   */
  async loadSettings(): Promise<AppSettings> {
    const filePath = path.join(this.storagePath, STORAGE_FILES.SETTINGS)
    
    try {
      if (!fs.existsSync(filePath)) {
        return DEFAULT_SETTINGS
      }

      const content = fs.readFileSync(filePath, 'utf-8')
      const settings = JSON.parse(content)
      
      // 合并默认设置，确保所有字段都存在
      return {
        ...DEFAULT_SETTINGS,
        ...settings,
        windowBounds: {
          ...DEFAULT_SETTINGS.windowBounds,
          ...settings.windowBounds,
        },
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
      return DEFAULT_SETTINGS
    }
  }

  /**
   * 保存应用设置
   */
  async saveSettings(settings: AppSettings): Promise<void> {
    const filePath = path.join(this.storagePath, STORAGE_FILES.SETTINGS)
    
    try {
      const content = JSON.stringify(settings, null, 2)
      fs.writeFileSync(filePath, content, 'utf-8')
    } catch (error) {
      console.error('Failed to save settings:', error)
      throw new Error(`无法保存应用设置: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 清除所有存储数据
   */
  async clearAll(): Promise<void> {
    try {
      const historyPath = path.join(this.storagePath, STORAGE_FILES.HISTORY)
      const settingsPath = path.join(this.storagePath, STORAGE_FILES.SETTINGS)
      
      if (fs.existsSync(historyPath)) {
        fs.unlinkSync(historyPath)
      }
      
      if (fs.existsSync(settingsPath)) {
        fs.unlinkSync(settingsPath)
      }
    } catch (error) {
      console.error('Failed to clear storage:', error)
      throw new Error(`无法清除存储数据: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
