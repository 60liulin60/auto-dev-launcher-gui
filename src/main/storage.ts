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
   * 原子化写入文件：先写临时文件，再重命名，保留 .bak 备份
   * 防止写入中途断电导致数据损坏
   */
  private atomicWriteFile(filePath: string, content: string): void {
    const tmpPath = `${filePath}.tmp`
    const bakPath = `${filePath}.bak`

    // 写入临时文件
    fs.writeFileSync(tmpPath, content, 'utf-8')

    // 备份现有文件（如果存在）
    if (fs.existsSync(filePath)) {
      try {
        fs.copyFileSync(filePath, bakPath)
      } catch {
        // 备份失败不阻塞写入
      }
    }

    // 原子替换：将临时文件重命名为目标文件
    fs.renameSync(tmpPath, filePath)
  }

  /**
   * 读取文件内容，读取失败时自动尝试从 .bak 恢复
   */
  private readFileWithFallback(filePath: string): string | null {
    // 先尝试主文件
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        // 验证内容是有效 JSON
        JSON.parse(content)
        return content
      } catch {
        console.warn(`主文件损坏，尝试从备份恢复: ${filePath}`)
      }
    }

    // 尝试 .bak 备份文件
    const bakPath = `${filePath}.bak`
    if (fs.existsSync(bakPath)) {
      try {
        const content = fs.readFileSync(bakPath, 'utf-8')
        JSON.parse(content)
        console.log(`已从备份文件成功恢复: ${bakPath}`)
        // 将备份恢复为主文件
        fs.copyFileSync(bakPath, filePath)
        return content
      } catch {
        console.error(`备份文件也已损坏: ${bakPath}`)
      }
    }

    return null
  }

  /**
   * 加载项目历史
   */
  async loadProjectHistory(): Promise<ProjectHistoryEntry[]> {
    const filePath = path.join(this.storagePath, STORAGE_FILES.HISTORY)
    
    try {
      const content = this.readFileWithFallback(filePath)
      if (!content) return []

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
      this.atomicWriteFile(filePath, content)
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
      const content = this.readFileWithFallback(filePath)
      if (!content) return DEFAULT_SETTINGS

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
      this.atomicWriteFile(filePath, content)
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
      
      for (const p of [historyPath, settingsPath, `${historyPath}.bak`, `${settingsPath}.bak`]) {
        if (fs.existsSync(p)) fs.unlinkSync(p)
      }
    } catch (error) {
      console.error('Failed to clear storage:', error)
      throw new Error(`无法清除存储数据: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
