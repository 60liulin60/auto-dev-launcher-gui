import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoApp, WailsRuntime } from '../../wails-runtime'

// 每个用例都重建 window.go / window.runtime，避免相互污染。
function installWailsRuntime(app: Partial<GoApp>, runtime?: Partial<WailsRuntime>): void {
  ;(window as Window & { go?: unknown }).go = {
    main: { App: app as GoApp },
  }
  if (runtime) {
    ;(window as Window & { runtime?: unknown }).runtime = runtime as WailsRuntime
  }
}

describe('desktop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    delete (window as Window & { go?: unknown }).go
    delete (window as Window & { runtime?: unknown }).runtime
  })

  it('returns the folder selected via the Wails dialog', async () => {
    const selectFolder = vi.fn().mockResolvedValueOnce('E:/workspace/project')
    installWailsRuntime({ SelectFolder: selectFolder })

    const { desktop } = await import('./desktop')

    await expect(desktop.selectFolder()).resolves.toBe('E:/workspace/project')
    expect(selectFolder).toHaveBeenCalledTimes(1)
  })

  it('maps an empty dialog result to null', async () => {
    const selectFolder = vi.fn().mockResolvedValueOnce('')
    installWailsRuntime({ SelectFolder: selectFolder })

    const { desktop } = await import('./desktop')

    await expect(desktop.selectFolder()).resolves.toBeNull()
  })

  it('normalizes history timestamps returned by the Go backend', async () => {
    const loadHistory = vi.fn().mockResolvedValueOnce([
      {
        id: 'project-1',
        name: 'project-1',
        path: 'E:/workspace/project',
        lastLaunched: 1_711_111_111_111,
        config: {
          command: 'pnpm dev',
          cwd: 'E:/workspace/project',
        },
      },
    ])
    installWailsRuntime({ LoadHistory: loadHistory })

    const { desktop } = await import('./desktop')
    const history = await desktop.loadHistory()

    expect(loadHistory).toHaveBeenCalledTimes(1)
    expect(history).toHaveLength(1)
    expect(history[0]?.lastLaunched).toBeInstanceOf(Date)
  })

  it('serializes history timestamps to milliseconds before sending to Go', async () => {
    const addToHistory = vi.fn().mockResolvedValueOnce(undefined)
    installWailsRuntime({ AddToHistory: addToHistory })

    const { desktop } = await import('./desktop')
    const lastLaunched = new Date(1_711_111_111_111)
    await desktop.addToHistory({
      id: 'project-1',
      name: 'project-1',
      path: 'E:/workspace/project',
      lastLaunched,
      config: { command: 'pnpm dev', cwd: 'E:/workspace/project' },
    })

    expect(addToHistory).toHaveBeenCalledWith(
      expect.objectContaining({ lastLaunched: 1_711_111_111_111 })
    )
  })

  it('forwards server output events and exposes the unlisten callback', async () => {
    const unlistenMock = vi.fn()
    let eventHandler: ((...data: unknown[]) => void) | undefined

    const eventsOn = vi.fn((_eventName: string, nextHandler: (...data: unknown[]) => void) => {
      eventHandler = nextHandler
      return unlistenMock
    })
    installWailsRuntime({}, { EventsOn: eventsOn } as Partial<WailsRuntime>)

    const { desktop } = await import('./desktop')
    const callback = vi.fn()
    const removeListener = await desktop.onServerOutput(callback)

    eventHandler?.({ projectId: 'project-1', output: 'ready' })

    expect(callback).toHaveBeenCalledWith('project-1', 'ready')

    removeListener()

    expect(unlistenMock).toHaveBeenCalledTimes(1)
  })

  it('passes the runtime override and normalizes the process snapshot', async () => {
    const startServer = vi.fn().mockResolvedValueOnce({
      projectId: 'project-1',
      pid: 1234,
      status: 'running',
      startTime: 1_711_111_111_111,
      runtime: '18.20.4',
      runtimeSource: '.nvmrc',
    })
    installWailsRuntime({ StartServer: startServer })

    const { desktop } = await import('./desktop')
    const process = await desktop.startServer(
      'project-1',
      'E:/workspace/project',
      { command: 'pnpm dev', cwd: 'E:/workspace/project' },
      '18.20.4'
    )

    expect(startServer).toHaveBeenCalledWith(
      'project-1',
      'E:/workspace/project',
      { command: 'pnpm dev', cwd: 'E:/workspace/project' },
      '18.20.4'
    )
    expect(process.startTime).toBeInstanceOf(Date)
    expect(process.runtime).toBe('18.20.4')
  })

  it('defaults the runtime override to an empty string (自动)', async () => {
    const startServer = vi.fn().mockResolvedValueOnce({
      projectId: 'project-1',
      pid: 1,
      status: 'running',
      startTime: 0,
    })
    installWailsRuntime({ StartServer: startServer })

    const { desktop } = await import('./desktop')
    await desktop.startServer('project-1', 'E:/workspace/project', {
      command: 'pnpm dev',
      cwd: 'E:/workspace/project',
    })

    expect(startServer).toHaveBeenCalledWith(
      'project-1',
      'E:/workspace/project',
      { command: 'pnpm dev', cwd: 'E:/workspace/project' },
      ''
    )
  })

  it('forwards status-change payloads including exit metadata', async () => {
    let eventHandler: ((...data: unknown[]) => void) | undefined

    const eventsOn = vi.fn((_eventName: string, nextHandler: (...data: unknown[]) => void) => {
      eventHandler = nextHandler
      return vi.fn()
    })
    installWailsRuntime({}, { EventsOn: eventsOn } as Partial<WailsRuntime>)

    const { desktop } = await import('./desktop')
    const callback = vi.fn()
    await desktop.onServerStatusChange(callback)

    eventHandler?.({
      projectId: 'project-1',
      status: 'completed',
      exitCode: 0,
      durationMs: 1234,
      runtime: '18.20.4',
      runtimeSource: '系统默认',
      runtimeNote: '声明无法解析，已回退系统默认',
    })

    expect(callback).toHaveBeenCalledWith('project-1', {
      projectId: 'project-1',
      status: 'completed',
      exitCode: 0,
      durationMs: 1234,
      runtime: '18.20.4',
      runtimeSource: '系统默认',
      runtimeNote: '声明无法解析，已回退系统默认',
    })
  })

  it('forwards runtime discovery and script helpers', async () => {
    const listRuntimes = vi
      .fn()
      .mockResolvedValueOnce([{ version: '18.20.4', dir: 'C:/nvm/v18.20.4', source: 'nvm', label: 'Node v18.20.4' }])
    const previewRuntime = vi.fn().mockResolvedValueOnce({
      version: '18.20.4',
      label: 'Node v18.20.4',
      source: 'nvm',
      missing: true,
      requested: '18.20.4',
      available: ['20.11.0'],
    })
    const installRuntime = vi.fn().mockResolvedValueOnce(undefined)
    const selectScriptFile = vi.fn().mockResolvedValueOnce('E:/scripts/start.bat')
    const loadScriptConfig = vi.fn().mockResolvedValueOnce({
      kind: 'script',
      command: 'E:/scripts/start.bat',
      cwd: 'E:/scripts',
      name: 'start',
    })

    installWailsRuntime({
      ListRuntimes: listRuntimes,
      PreviewRuntime: previewRuntime,
      InstallRuntime: installRuntime,
      SelectScriptFile: selectScriptFile,
      LoadScriptConfig: loadScriptConfig,
    })

    const { desktop } = await import('./desktop')

    await expect(desktop.listRuntimes()).resolves.toHaveLength(1)
    const preview = await desktop.previewRuntime('E:/workspace/project', '')
    expect(preview.missing).toBe(true)
    expect(previewRuntime).toHaveBeenCalledWith('E:/workspace/project', '')

    await desktop.installRuntime('18.20.4')
    expect(installRuntime).toHaveBeenCalledWith('18.20.4')

    await expect(desktop.selectScriptFile()).resolves.toBe('E:/scripts/start.bat')

    const config = await desktop.loadScriptConfig('E:/scripts/start.bat')
    expect(config.kind).toBe('script')
    expect(loadScriptConfig).toHaveBeenCalledWith('E:/scripts/start.bat')
  })

  it('maps an empty script selection to null', async () => {
    installWailsRuntime({ SelectScriptFile: vi.fn().mockResolvedValueOnce('') })

    const { desktop } = await import('./desktop')

    await expect(desktop.selectScriptFile()).resolves.toBeNull()
  })

  it('rejects runtime installation when the desktop bridge is unavailable', async () => {
    const { desktop } = await import('./desktop')

    await expect(desktop.installRuntime('18.20.4')).rejects.toThrow(
      '安装 Node 运行时 仅在桌面应用中可用。'
    )
    await expect(desktop.listRuntimes()).resolves.toEqual([])
  })
})
