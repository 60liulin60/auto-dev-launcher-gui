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
})
