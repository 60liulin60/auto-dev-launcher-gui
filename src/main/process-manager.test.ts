import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ProcessManager } from './process-manager'
import { EventEmitter } from 'events'

// Mock shared modules since they might involve file system or complex logic
vi.mock('../src/shared/security', () => ({
  PathSecurity: {
    sanitizePath: (p: string) => p,
    validateProjectPath: () => ({ valid: true })
  },
  CommandSecurity: {
    validateDevConfig: () => ({ valid: true }),
    sanitizeCommand: (c: string) => c
  },
  PackageManagerSecurity: {
    detectPackageManager: () => 'npm',
    buildInstallCommand: () => 'npm install'
  }
}))

describe('ProcessManager Log Buffering', () => {
  let processManager: any

  beforeEach(() => {
    processManager = new ProcessManager()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('should buffer multiple outputs and flush them together', () => {
    const projectId = 'test-project'
    const outputSpy = vi.fn()
    processManager.on('output', outputSpy)

    // Simulate rapid outputs
    processManager.appendToBuffer(projectId, 'Line 1\n')
    processManager.appendToBuffer(projectId, 'Line 2\n')
    processManager.appendToBuffer(projectId, 'Line 3\n')

    // Should not have emitted yet
    expect(outputSpy).not.toHaveBeenCalled()

    // Advance time by 100ms (BUFFER_FLUSH_INTERVAL)
    vi.advanceTimersByTime(100)

    // Should have emitted once with merged content
    expect(outputSpy).toHaveBeenCalledTimes(1)
    expect(outputSpy).toHaveBeenCalledWith(projectId, 'Line 1\nLine 2\nLine 3\n')
  })

  it('should clear buffer after flushing', () => {
    const projectId = 'test-project'
    const outputSpy = vi.fn()
    processManager.on('output', outputSpy)

    processManager.appendToBuffer(projectId, 'First Batch\n')
    vi.advanceTimersByTime(100)
    expect(outputSpy).toHaveBeenCalledWith(projectId, 'First Batch\n')
    outputSpy.mockClear()

    processManager.appendToBuffer(projectId, 'Second Batch\n')
    vi.advanceTimersByTime(100)
    expect(outputSpy).toHaveBeenCalledWith(projectId, 'Second Batch\n')
    expect(outputSpy).toHaveBeenCalledTimes(1)
  })

  it('should stop timer when process exits', () => {
    const projectId = 'test-project'
    
    // Trigger buffer start
    processManager.appendToBuffer(projectId, 'Exiting log')
    
    expect(processManager.bufferTimers.has(projectId)).toBe(true)
    
    // Manually call internal stopBufferTimer or trigger exit logic
    processManager.stopBufferTimer(projectId)
    
    expect(processManager.bufferTimers.has(projectId)).toBe(false)
  })
})
