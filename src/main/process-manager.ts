/**
 * 进程管理器
 * 负责管理开发服务器进程的生命周期
 */

import { spawn, ChildProcess } from 'child_process'
import { DevConfig, ServerProcess, ServerStatus } from '../shared/types'
import {
  PathSecurity,
  CommandSecurity,
  PackageManagerSecurity
} from '../shared/security'
import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'

// 禁止用户配置覆盖的关键系统环境变量白名单
const ENV_PROTECTED_KEYS = new Set([
  'PATH', 'Path', 'path',
  'SYSTEMROOT', 'SystemRoot',
  'SYSTEMDRIVE', 'SystemDrive',
  'COMSPEC',
  'WINDIR',
  'NODE_OPTIONS',
  'NODE_PATH',
  'LD_LIBRARY_PATH',
  'DYLD_LIBRARY_PATH',
])

// 识别本地服务 URL 的正则（兼容 vite/webpack/next 等框架输出格式）
const LOCAL_URL_REGEX = /(?:Local|local|localhost|127\.0\.0\.1)[\s:]+(?:http:\/\/)?(?:localhost|127\.0\.0\.1):(\d+)/i

export class ProcessManager extends EventEmitter {
  private processes: Map<string, ChildProcess> = new Map()
  private processInfo: Map<string, ServerProcess> = new Map()
  
  // 日志缓冲区，用于批量发送日志，减少 IPC 背压
  private outputBuffers: Map<string, string[]> = new Map()
  private bufferIntervals: Map<string, NodeJS.Timeout> = new Map()
  private readonly BUFFER_FLUSH_INTERVAL = 100 // 100ms 冲刷一次

  // 配置常量
  private readonly DEPENDENCY_INSTALL_TIMEOUT = 5 * 60 * 1000 // 5分钟
  private readonly SERVER_STOP_TIMEOUT = 30 * 1000 // 30秒
  private readonly MAX_RETRY_ATTEMPTS = 3
  private readonly RETRY_DELAY = 1000 // 1秒

  /**
   * 带超时的Promise包装器
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(timeoutMessage))
      }, timeoutMs)

      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timeoutId))
    })
  }

  /**
   * 重试机制
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    maxAttempts: number = this.MAX_RETRY_ATTEMPTS,
    delayMs: number = this.RETRY_DELAY,
    operationName: string = 'operation'
  ): Promise<T> {
    let lastError: Error

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt === maxAttempts) {
          break
        }

        console.warn(`${operationName} failed (attempt ${attempt}/${maxAttempts}):`, lastError.message)

        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt))
      }
    }

    throw new Error(`${operationName} failed after ${maxAttempts} attempts: ${lastError!.message}`)
  }

  /**
   * 检测项目使用的包管理器（带安全检查）
   */
  private detectPackageManager(projectPath: string): string {
    try {
      const sanitizedPath = PathSecurity.sanitizePath(projectPath)
      return PackageManagerSecurity.detectPackageManager(sanitizedPath)
    } catch (error) {
      console.warn('包管理器检测失败，使用默认npm:', error)
      return 'npm'
    }
  }

  /**
   * 检查并安装依赖
   */
  private async installDependenciesIfNeeded(projectId: string, projectPath: string): Promise<void> {
    const nodeModulesPath = path.join(projectPath, 'node_modules')
    const packageJsonPath = path.join(projectPath, 'package.json')
    
    // 检查是否存在 package.json
    if (!fs.existsSync(packageJsonPath)) {
      return // 没有 package.json，跳过依赖安装
    }
    
    // 检查 node_modules 是否存在
    if (fs.existsSync(nodeModulesPath)) {
      return // node_modules 已存在，跳过安装
    }
    
    // 检测包管理器
    const packageManager = this.detectPackageManager(projectPath)

    // 构建安全的安装命令
    const installCommand = PackageManagerSecurity.buildInstallCommand(packageManager)
    
    // 发送安装提示
    this.emit('output', projectId, `\n检测到缺少 node_modules 目录，正在使用 ${packageManager} 安装依赖...\n`)
    this.emit('output', projectId, `执行命令: ${installCommand}\n\n`)
    
    // 执行安装（带超时和重试）
    const installOperation = () => new Promise<void>((resolve, reject) => {
      const installProcess = spawn(packageManager, ['install'], {
        cwd: projectPath,
        shell: true,
        windowsHide: false,
      })

      let hasExited = false
      
      // 监听安装输出 - 使用缓冲区
      installProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString('utf8')
        const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '')
        this.appendToBuffer(projectId, cleanOutput)
      })
      
      installProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString('utf8')
        const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '')
        this.appendToBuffer(projectId, cleanOutput)
      })
      
      installProcess.on('exit', (code: number | null) => {
        if (hasExited) return
        hasExited = true

        if (code === 0) {
          this.emit('output', projectId, `\n✓ 依赖安装完成，开始启动项目...\n\n`)
          resolve()
        } else {
          const error = new Error(`依赖安装失败，退出码: ${code}`)
          this.emit('output', projectId, `\n✗ ${error.message}\n`)
          reject(error)
        }
      })
      
      installProcess.on('error', (error: Error) => {
        if (hasExited) return
        hasExited = true

        this.emit('output', projectId, `\n✗ 依赖安装出错: ${error.message}\n`)
        reject(error)
      })
    })

    // 使用重试机制和超时控制
    return this.withRetry(
      () => this.withTimeout(
        installOperation(),
        this.DEPENDENCY_INSTALL_TIMEOUT,
        `依赖安装超时 (${this.DEPENDENCY_INSTALL_TIMEOUT / 1000}秒)`
      ),
      this.MAX_RETRY_ATTEMPTS,
      this.RETRY_DELAY,
      '依赖安装'
    )
  }

  /**
   * 启动服务器
   */
  async startServer(projectId: string, projectPath: string, config: DevConfig): Promise<ServerProcess> {
    console.log(`Starting server for project: ${projectId}`)

    // 强制清理任何现有的条目，确保干净的状态
    this.processes.delete(projectId)
    this.processInfo.delete(projectId)
    // 验证输入参数安全性
    const pathValidation = PathSecurity.validateProjectPath(projectPath)
    if (!pathValidation.valid) {
      throw new Error(`项目路径无效: ${pathValidation.error}`)
    }

    const configValidation = CommandSecurity.validateDevConfig(config)
    if (!configValidation.valid) {
      throw new Error(`配置无效: ${configValidation.errors.join(', ')}`)
    }

    // 由于我们在开始时已经清理了条目，这里不应该再有冲突

    // 创建进程信息
    const processInfo: ServerProcess = {
      projectId,
      pid: 0,
      status: 'starting',
      startTime: new Date(),
    }
    
    this.processInfo.set(projectId, processInfo)

    try {
      // 检查并安装依赖（如果需要）
      await this.installDependenciesIfNeeded(projectId, projectPath)
      
      // 清理和解析命令
      const sanitizedCommand = CommandSecurity.sanitizeCommand(config.command)
      const [command, ...args] = sanitizedCommand.split(' ')

      // 验证工作目录
      const workDir = config.cwd || projectPath
      const workDirValidation = PathSecurity.validateProjectPath(workDir)
      if (!workDirValidation.valid) {
        throw new Error(`工作目录无效: ${workDirValidation.error}`)
      }
      
      // 合并环境变量，过滤白名单中受保护的 key
      const safeUserEnv: Record<string, string> = {}
      if (config.env) {
        for (const [key, value] of Object.entries(config.env)) {
          if (ENV_PROTECTED_KEYS.has(key)) {
            console.warn(`[ProcessManager] 已拦截对受保护环境变量的覆盖: ${key}`)
            this.emit('output', projectId, `[安全] 已忽略对系统环境变量 "${key}" 的覆盖\n`)
          } else {
            safeUserEnv[key] = value
          }
        }
      }

      // 启动进程
      const childProcess = spawn(command, args, {
        cwd: workDir,
        env: {
          ...process.env,
          ...safeUserEnv,
        },
        shell: true,
        windowsHide: false,
      })

      // 更新 PID
      if (childProcess.pid) {
        processInfo.pid = childProcess.pid
      }

      // 保存进程引用
      this.processes.set(projectId, childProcess)

      // 设置超时，如果10秒内没有收到输出，认为启动失败
      let startupTimeout: NodeJS.Timeout | null = setTimeout(() => {
        if (processInfo.status === 'starting') {
          console.log(`Startup timeout for ${projectId}, checking process status`)
          // 检查进程是否还在运行
          try {
            process.kill(childProcess.pid || 0, 0)
            // 进程还在运行，但没有输出，可能是卡住了
            console.log(`Process ${projectId} is running but no output, assuming it's working`)
            processInfo.status = 'running'
            this.processInfo.set(projectId, processInfo)
            this.emit('status-change', projectId, 'running')
          } catch (error) {
            // 进程已经不存在
            console.log(`Process ${projectId} failed to start`)
            processInfo.status = 'error'
            this.processInfo.set(projectId, processInfo)
            this.emit('status-change', projectId, 'error')
            this.emit('error', projectId, '进程启动失败')
          }
        }
        startupTimeout = null
      }, 10000)

      // 标记是否已检测到本地 URL，避免重复上报
      let urlDetected = false

      // 监听标准输出 - 使用缓冲区
      childProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString('utf8')
        // 移除 ANSI 颜色代码，使输出更清晰
        const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '')

        // 如果进程状态还是 'starting'，说明这是第一次输出，将状态改为 'running'
        if (processInfo.status === 'starting') {
          console.log(`First output received for ${projectId}, setting status to running`)
          if (startupTimeout) {
            clearTimeout(startupTimeout)
            startupTimeout = null
          }
          processInfo.status = 'running'
          this.processInfo.set(projectId, processInfo)
          this.emit('status-change', projectId, 'running')
        }

        // 检测本地服务 URL（只上报一次）
        if (!urlDetected) {
          const match = cleanOutput.match(LOCAL_URL_REGEX)
          if (match) {
            const port = match[1]
            const detectedUrl = `http://localhost:${port}`
            urlDetected = true
            console.log(`[ProcessManager] 检测到本地服务 URL: ${detectedUrl}`)
            this.emit('url-detected', projectId, detectedUrl)
          }
        }

        this.appendToBuffer(projectId, cleanOutput)
      })

      // 监听错误输出 - 使用缓冲区（部分框架如 Next.js 将信息输出到 stderr）
      childProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString('utf8')
        // 移除 ANSI 颜色代码
        const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '')

        // 同样检测 URL
        if (!urlDetected) {
          const match = cleanOutput.match(LOCAL_URL_REGEX)
          if (match) {
            const port = match[1]
            const detectedUrl = `http://localhost:${port}`
            urlDetected = true
            console.log(`[ProcessManager] 检测到本地服务 URL (stderr): ${detectedUrl}`)
            this.emit('url-detected', projectId, detectedUrl)
          }
        }

        this.appendToBuffer(projectId, cleanOutput)
      })

      // 监听进程启动
      childProcess.on('spawn', () => {
        console.log(`Process spawned for ${projectId}, PID: ${childProcess.pid}`)
        // 不要在这里设置状态为 'running'，等待第一次输出再设置
        // processInfo.status = 'running'
        // this.processInfo.set(projectId, processInfo)
        // this.emit('status-change', projectId, 'running')
      })

      // 监听进程错误
      childProcess.on('error', (error: Error) => {
        processInfo.status = 'error'
        this.processInfo.set(projectId, processInfo)
        this.emit('status-change', projectId, 'error')
        this.emit('error', projectId, error.message)
      })

      // 监听进程退出
      childProcess.on('exit', (code: number | null) => {
        console.log(`Process exited for ${projectId}, code: ${code}`)
        processInfo.status = 'stopped'
        this.processInfo.set(projectId, processInfo)
        this.emit('status-change', projectId, 'stopped')
        this.emit('exit', projectId, code)

        // 立即冲刷该项目的缓冲区
        this.flushBuffer(projectId)
        this.stopBufferInterval(projectId)

        // 清理
        this.processes.delete(projectId)
        console.log(`Cleaned up process entry for ${projectId}`)
      })

      return processInfo
    } catch (error) {
      processInfo.status = 'error'
      this.processInfo.set(projectId, processInfo)
      throw error
    }
  }

  /**
   * 将输出添加到缓冲区并启动定时冲刷
   */
  private appendToBuffer(projectId: string, output: string): void {
    if (!this.outputBuffers.has(projectId)) {
      this.outputBuffers.set(projectId, [])
    }
    
    this.outputBuffers.get(projectId)!.push(output)
    
    // 如果没有正在运行的冲刷定时器，则启动一个
    if (!this.bufferIntervals.has(projectId)) {
      const interval = setInterval(() => {
        this.flushBuffer(projectId)
      }, this.BUFFER_FLUSH_INTERVAL)
      this.bufferIntervals.set(projectId, interval)
    }
  }

  /**
   * 冲刷缓冲区，将合并后的日志发送给渲染进程
   */
  private flushBuffer(projectId: string): void {
    const buffer = this.outputBuffers.get(projectId)
    if (buffer && buffer.length > 0) {
      const mergedOutput = buffer.join('')
      this.emit('output', projectId, mergedOutput)
      this.outputBuffers.set(projectId, []) // 清空缓冲区
    }
  }

  /**
   * 停止缓冲区定时器
   */
  private stopBufferInterval(projectId: string): void {
    const interval = this.bufferIntervals.get(projectId)
    if (interval) {
      clearInterval(interval)
      this.bufferIntervals.delete(projectId)
    }
  }

  /**
   * 停止服务器
   */
  async stopServer(projectId: string): Promise<void> {
    const childProcess = this.processes.get(projectId)
    
    if (!childProcess) {
      throw new Error('服务器未运行')
    }

    console.log(`Stopping server ${projectId}, PID: ${childProcess.pid}`)

    // 立即发送终止信号,不等待进程退出
    if (process.platform === 'win32' && childProcess.pid) {
      try {
        // Windows: 使用 taskkill 终止进程树
        spawn('taskkill', ['/pid', childProcess.pid.toString(), '/T', '/F'], {
          shell: true,
          windowsHide: true,
          stdio: 'ignore'
        })
        console.log(`Sent taskkill signal to ${projectId}`)
      } catch (error) {
        console.error('Failed to send taskkill, using force kill:', error)
        this.forceKillProcess(childProcess)
      }
    } else {
      // Unix: 发送 SIGKILL 立即终止
      try {
        childProcess.kill('SIGKILL')
        console.log(`Sent SIGKILL to ${projectId}`)
      } catch (error) {
        console.error('Failed to kill process:', error)
      }
    }

    // 在后台监听进程退出,清理资源
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      this.processes.delete(projectId)
      console.log(`Cleaned up process entry for ${projectId}`)
    }

    // 设置监听器,当进程真正退出时清理
    childProcess.once('exit', cleanup)
    childProcess.once('error', cleanup)

    // 设置超时,如果30秒后还没退出,强制清理
    setTimeout(() => {
      if (this.processes.has(projectId)) {
        console.warn(`Process ${projectId} still exists after 30s, force cleaning up`)
        cleanup()
      }
    }, 30000)

    // 立即返回,不等待进程退出
    console.log(`stopServer returning immediately for ${projectId}`)
  }

  /**
   * 强制杀死进程
   */
  private forceKillProcess(childProcess: ChildProcess): void {
    try {
      if (process.platform === 'win32' && childProcess.pid) {
        spawn('taskkill', ['/pid', childProcess.pid.toString(), '/T', '/F'], {
          shell: true,
          windowsHide: true,
          stdio: 'ignore'
        })
      } else {
        childProcess.kill('SIGKILL')
      }
    } catch (error) {
      console.error('Failed to force kill process:', error)
    }
  }

  /**
   * 获取服务器状态
   */
  getServerStatus(projectId: string): ServerStatus {
    const info = this.processInfo.get(projectId)
    return info?.status || 'idle'
  }

  /**
   * 获取所有运行中的服务器
   */
  getRunningServers(): string[] {
    return Array.from(this.processes.keys())
  }

  /**
   * 停止所有服务器
   */
  async stopAllServers(): Promise<void> {
    const projectIds = Array.from(this.processes.keys())
    
    console.log(`Stopping all servers: ${projectIds.length} servers running`)
    
    // 立即发送终止信号给所有进程
    for (const projectId of projectIds) {
      try {
        await this.stopServer(projectId)
      } catch (err) {
        console.error(`Failed to stop server ${projectId}:`, err)
      }
    }
    
    // 等待一小段时间确保所有进程都收到终止信号
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // 强制清理所有残留的进程
    for (const projectId of projectIds) {
      const childProcess = this.processes.get(projectId)
      if (childProcess) {
        console.log(`Force killing remaining process: ${projectId}`)
        this.forceKillProcess(childProcess)
        this.processes.delete(projectId)
      }
    }
    
    console.log('All servers stopped')
  }
}
