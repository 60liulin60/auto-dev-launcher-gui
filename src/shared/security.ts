/**
 * 安全工具模块
 * 提供输入验证、路径清理和命令注入防护功能
 */

import * as path from 'path'
import { DevConfig } from './types'

/**
 * 路径清理和验证
 */
export class PathSecurity {
  /**
   * 清理和标准化路径
   * 防止路径遍历攻击
   */
  static sanitizePath(inputPath: string): string {
    if (!inputPath || typeof inputPath !== 'string') {
      throw new Error('路径不能为空且必须是字符串')
    }

    // 移除前后空白字符
    const trimmedPath = inputPath.trim()

    // 检查是否为空
    if (!trimmedPath) {
      throw new Error('路径不能为空')
    }

    // 标准化路径分隔符
    const normalizedPath = path.normalize(trimmedPath)

    // 防止路径遍历攻击
    if (normalizedPath.includes('..') || normalizedPath.includes('../')) {
      throw new Error('路径包含非法字符')
    }

    // 检查路径长度限制
    if (normalizedPath.length > 4096) {
      throw new Error('路径长度超过限制')
    }

    // 转换为绝对路径（可选，根据需求）
    const absolutePath = path.resolve(normalizedPath)

    return absolutePath
  }

  /**
   * 验证项目路径
   * 检查路径是否存在且包含有效的package.json
   */
  static validateProjectPath(projectPath: string): { valid: boolean; error?: string } {
    try {
      const sanitizedPath = this.sanitizePath(projectPath)

      // 检查路径是否可访问
      const fs = require('fs')
      if (!fs.existsSync(sanitizedPath)) {
        return { valid: false, error: '项目路径不存在' }
      }

      // 检查是否为目录
      const stats = fs.statSync(sanitizedPath)
      if (!stats.isDirectory()) {
        return { valid: false, error: '路径不是有效的目录' }
      }

      // 检查package.json是否存在
      const packageJsonPath = path.join(sanitizedPath, 'package.json')
      if (!fs.existsSync(packageJsonPath)) {
        return { valid: false, error: '目录中未找到package.json文件' }
      }

      // 验证package.json格式
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
        if (!packageJson.name || !packageJson.version) {
          return { valid: false, error: 'package.json格式无效' }
        }
      } catch (error) {
        return { valid: false, error: 'package.json文件格式错误' }
      }

      return { valid: true }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : '路径验证失败'
      }
    }
  }

  /**
   * 检查路径是否在允许的范围内
   */
  static isPathAllowed(inputPath: string, allowedRoots: string[] = []): boolean {
    try {
      const sanitizedPath = this.sanitizePath(inputPath)
      const resolvedPath = path.resolve(sanitizedPath)

      // 如果没有指定允许的根目录，则只检查基本的安全性
      if (allowedRoots.length === 0) {
        return true
      }

      // 检查路径是否在允许的根目录内
      return allowedRoots.some(root => {
        const resolvedRoot = path.resolve(root)
        return resolvedPath.startsWith(resolvedRoot)
      })
    } catch {
      return false
    }
  }
}

/**
 * 命令安全验证
 */
export class CommandSecurity {
  /**
   * 验证开发配置
   */
  static validateDevConfig(config: DevConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // 验证命令
    if (!config.command || typeof config.command !== 'string') {
      errors.push('命令不能为空且必须是字符串')
    } else {
      // 检查命令长度
      if (config.command.length > 1000) {
        errors.push('命令长度超过限制')
      }

      // 检查潜在的危险命令
      const dangerousPatterns = [
        /rm\s+-rf\s+\//,
        /del\s+\/s\s+\/q\s+c:\\windows/,
        /format\s+c:/,
        /shutdown\s+-s/,
        /taskkill\s+\/im\s+explorer\.exe/
      ]

      for (const pattern of dangerousPatterns) {
        if (pattern.test(config.command.toLowerCase())) {
          errors.push('命令包含潜在危险操作')
          break
        }
      }
    }

    // 验证工作目录
    if (config.cwd) {
      const pathValidation = PathSecurity.validateProjectPath(config.cwd)
      if (!pathValidation.valid) {
        errors.push(`工作目录无效: ${pathValidation.error}`)
      }
    }

    // 验证环境变量
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        if (typeof key !== 'string' || typeof value !== 'string') {
          errors.push('环境变量必须是字符串键值对')
          break
        }

        // 检查环境变量名安全性
        if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
          errors.push(`环境变量名格式无效: ${key}`)
        }

        // 检查环境变量值长度
        if (value.length > 1000) {
          errors.push(`环境变量值过长: ${key}`)
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * 清理命令字符串
   * 移除潜在的注入攻击
   */
  static sanitizeCommand(command: string): string {
    if (!command || typeof command !== 'string') {
      throw new Error('命令必须是非空字符串')
    }

    // 移除shell元字符的转义
    let sanitized = command
      .replace(/\$\([^)]*\)/g, '') // 移除命令替换
      .replace(/\$\{[^}]*\}/g, '') // 移除变量替换
      .replace(/`[^`]*`/g, '') // 移除反引号
      .replace(/\$\([^(]*$/g, '') // 移除未闭合的命令替换
      .replace(/\$\{[^}]*$/g, '') // 移除未闭合的变量替换
      .trim()

    // 检查清理后的命令是否为空
    if (!sanitized) {
      throw new Error('命令清理后为空')
    }

    return sanitized
  }
}

/**
 * 文件系统安全操作
 */
export class FileSystemSecurity {
  /**
   * 安全地检查文件是否存在
   */
  static safeFileExists(filePath: string): boolean {
    try {
      const sanitizedPath = PathSecurity.sanitizePath(filePath)
      const fs = require('fs')
      return fs.existsSync(sanitizedPath)
    } catch {
      return false
    }
  }

  /**
   * 安全地读取JSON文件
   */
  static safeReadJson(filePath: string): any {
    try {
      const sanitizedPath = PathSecurity.sanitizePath(filePath)
      const fs = require('fs')

      if (!fs.existsSync(sanitizedPath)) {
        throw new Error('文件不存在')
      }

      const content = fs.readFileSync(sanitizedPath, 'utf-8')

      // 检查文件大小限制（1MB）
      if (content.length > 1024 * 1024) {
        throw new Error('文件大小超过限制')
      }

      return JSON.parse(content)
    } catch (error) {
      throw new Error(`读取JSON文件失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

/**
 * 包管理器安全验证
 */
export class PackageManagerSecurity {
  private static readonly ALLOWED_MANAGERS = ['npm', 'yarn', 'pnpm']
  private static readonly MAX_COMMAND_LENGTH = 200

  /**
   * 验证包管理器名称
   */
  static validatePackageManager(manager: string): boolean {
    return this.ALLOWED_MANAGERS.includes(manager.toLowerCase())
  }

  /**
   * 检测包管理器（带安全检查）
   */
  static detectPackageManager(projectPath: string): string {
    try {
      const sanitizedPath = PathSecurity.sanitizePath(projectPath)
      const fs = require('fs')
      const pathModule = require('path')

      // 按优先级检测
      const lockFiles = [
        { file: 'pnpm-lock.yaml', manager: 'pnpm' },
        { file: 'yarn.lock', manager: 'yarn' },
        { file: 'package-lock.json', manager: 'npm' }
      ]

      for (const { file, manager } of lockFiles) {
        const lockPath = pathModule.join(sanitizedPath, file)
        if (fs.existsSync(lockPath)) {
          return manager
        }
      }

      return 'npm' // 默认使用npm
    } catch (error) {
      console.warn('包管理器检测失败，使用默认npm:', error)
      return 'npm'
    }
  }

  /**
   * 构建安全的安装命令
   */
  static buildInstallCommand(packageManager: string): string {
    if (!this.validatePackageManager(packageManager)) {
      throw new Error(`不支持的包管理器: ${packageManager}`)
    }

    const command = `${packageManager} install`

    if (command.length > this.MAX_COMMAND_LENGTH) {
      throw new Error('命令长度超过限制')
    }

    return command
  }
}
