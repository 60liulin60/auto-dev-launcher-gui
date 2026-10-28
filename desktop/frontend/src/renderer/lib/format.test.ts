import { describe, expect, it } from 'vitest'
import { formatDuration, getErrorMessage, pathBasename } from './format'

describe('formatDuration', () => {
  it('renders sub-minute durations in seconds with one decimal', () => {
    expect(formatDuration(0)).toBe('0.0s')
    expect(formatDuration(1234)).toBe('1.2s')
    expect(formatDuration(59_900)).toBe('59.9s')
  })

  it('renders longer durations as minutes and seconds', () => {
    expect(formatDuration(60_000)).toBe('1分0秒')
    expect(formatDuration(75_000)).toBe('1分15秒')
    expect(formatDuration(3_725_000)).toBe('62分5秒')
  })

  it('returns an empty string for unknown durations', () => {
    expect(formatDuration(undefined)).toBe('')
    expect(formatDuration(Number.NaN)).toBe('')
  })
})

describe('getErrorMessage', () => {
  it('prefers the Error message', () => {
    expect(getErrorMessage(new Error('需要 Node 20，本机未安装'))).toBe(
      '需要 Node 20，本机未安装'
    )
  })

  it('keeps plain strings and object messages', () => {
    expect(getErrorMessage('启动失败')).toBe('启动失败')
    expect(getErrorMessage({ message: '运行时缺失' })).toBe('运行时缺失')
  })

  it('falls back to a generic message', () => {
    expect(getErrorMessage(null)).toBe('未知错误')
    expect(getErrorMessage({})).toBe('未知错误')
  })
})

describe('pathBasename', () => {
  it('handles Windows and POSIX separators', () => {
    expect(pathBasename('E:\\scripts\\start.bat')).toBe('start.bat')
    expect(pathBasename('/home/user/start.sh')).toBe('start.sh')
    expect(pathBasename('E:\\scripts\\')).toBe('scripts')
  })
})
