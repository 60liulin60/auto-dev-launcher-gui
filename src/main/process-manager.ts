/**
 * 进程管理器
 * 负责管理开发服务器进程的生命周期
 */

import { spawn, ChildProcess } from 'child_process'
import { DevConfig, ServerProcess, ServerStatus } from '../shared/types'
import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'

export class ProcessManager extends EventEmitter {
  private processes: Map<string, ChildProcess> = new Map()
  private processInfo: Map<string, ServerProcess> = new Map()

  /**
   * 检测项目使用的包管理器
   */
  private detectPackageManager(projectPath: string): string {
    if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) {
      return 'pnpm'
    } else if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) {
      return 'yarn'
    } else if (fs.existsSync(path.join(projectPath, 'package-lock.json'))) {
      return 'npm'
    }
    return 'npm' // 默认使用 npm
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
    
    // 发送安装提示
    this.emit('output', projectId, `\n检测到缺少 node_modules 目录，正在使用 ${packageManager} 安装依赖...\n`)
    this.emit('output', projectId, `执行命令: ${packageManager} install\n\n`)
    
    // 执行安装
    return new Promise((resolve, reject) => {
      const installProcess = spawn(packageManager, ['install'], {
        cwd: projectPath,
        shell: true,
        windowsHide: false,
      })
      
      // 监听安装输出
      installProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString('utf8')
        const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '')
        this.emit('output', projectId, cleanOutput)
      })
      
      installProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString('utf8')
        const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '')
        this.emit('output', projectId, cleanOutput)
      })
      
      installProcess.on('exit', (code: number | null) => {
        if (code === 0) {
          this.emit('output', projectId, `\n✓ 依赖安装完成，开始启动项目...\n\n`)
          resolve()
        } else {
          this.emit('output', projectId, `\n✗ 依赖安装失败 (退出码: ${code})\n`)
          reject(new Error(`依赖安装失败，退出码: ${code}`))
        }
      })
      
      installProcess.on('error', (error: Error) => {
        this.emit('output', projectId, `\n✗ 依赖安装出错: ${error.message}\n`)
        reject(error)
      })
    })
  }

  /**
   * 启动服务器
   */
  async startServer(projectId: string, projectPath: string, config: DevConfig): Promise<ServerProcess> {
    // 检查是否已经在运行
    if (this.processes.has(projectId)) {
      throw new Error('服务器已在运行')
    }

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
      
      // 解析命令
      const [command, ...args] = config.command.split(' ')
      
      // 启动进程
      const childProcess = spawn(command, args, {
        cwd: config.cwd || projectPath,
        env: {
          ...process.env,
          ...config.env,
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

      // 监听标准输出
      childProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString('utf8')
        // 移除 ANSI 颜色代码，使输出更清晰
        const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '')
        this.emit('output', projectId, cleanOutput)
      })

      // 监听错误输出
      childProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString('utf8')
        // 移除 ANSI 颜色代码
        const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '')
        this.emit('output', projectId, cleanOutput)
      })

      // 监听进程启动
      childProcess.on('spawn', () => {
        processInfo.status = 'running'
        this.processInfo.set(projectId, processInfo)
        this.emit('status-change', projectId, 'running')
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
        processInfo.status = 'stopped'
        this.processInfo.set(projectId, processInfo)
        this.emit('status-change', projectId, 'stopped')
        this.emit('exit', projectId, code)
        
        // 清理
        this.processes.delete(projectId)
      })

      return processInfo
    } catch (error) {
      processInfo.status = 'error'
      this.processInfo.set(projectId, processInfo)
      throw error
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

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // 强制杀死进程树（Windows）
        if (process.platform === 'win32' && childProcess.pid) {
          try {
            // 使用 taskkill 杀死整个进程树
            spawn('taskkill', ['/pid', childProcess.pid.toString(), '/T', '/F'], {
              shell: true,
              windowsHide: true,
            })
          } catch (error) {
            console.error('Failed to kill process tree:', error)
          }
        } else {
          childProcess.kill('SIGKILL')
        }
        resolve()
      }, 2000)

      childProcess.on('exit', () => {
        clearTimeout(timeout)
        this.processes.delete(projectId)
        resolve()
      })

      // Windows: 使用 taskkill 杀死进程树
      if (process.platform === 'win32' && childProcess.pid) {
        try {
          spawn('taskkill', ['/pid', childProcess.pid.toString(), '/T', '/F'], {
            shell: true,
            windowsHide: true,
          })
        } catch (error) {
          console.error('Failed to kill process:', error)
          childProcess.kill('SIGKILL')
        }
      } else {
        // Unix: 发送终止信号
        childProcess.kill('SIGTERM')
      }
    })
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
    
    await Promise.all(
      projectIds.map(projectId => 
        this.stopServer(projectId).catch(err => 
          console.error(`Failed to stop server ${projectId}:`, err)
        )
      )
    )
  }
}
