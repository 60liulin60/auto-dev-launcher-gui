import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock, listenMock, openDialogMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
  openDialogMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openDialogMock,
}))

import { desktop } from './desktop'

describe('desktop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the first selected folder from the Tauri dialog', async () => {
    openDialogMock.mockResolvedValueOnce(['E:/workspace/project'])

    await expect(desktop.selectFolder()).resolves.toBe('E:/workspace/project')
  })

  it('normalizes history timestamps returned by Tauri', async () => {
    invokeMock.mockResolvedValueOnce([
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

    const history = await desktop.loadHistory()

    expect(invokeMock).toHaveBeenCalledWith('load_history')
    expect(history).toHaveLength(1)
    expect(history[0]?.lastLaunched).toBeInstanceOf(Date)
  })

  it('forwards server output events and exposes the unlisten callback', async () => {
    const unlistenMock = vi.fn()
    let eventHandler:
      | ((event: { payload: { projectId: string; output: string } }) => void)
      | undefined

    listenMock.mockImplementationOnce(async (_eventName, nextHandler) => {
      eventHandler = nextHandler
      return unlistenMock
    })

    const callback = vi.fn()
    const removeListener = await desktop.onServerOutput(callback)

    eventHandler?.({
      payload: {
        projectId: 'project-1',
        output: 'ready',
      },
    })

    expect(callback).toHaveBeenCalledWith('project-1', 'ready')

    removeListener()

    expect(unlistenMock).toHaveBeenCalledTimes(1)
  })
})
