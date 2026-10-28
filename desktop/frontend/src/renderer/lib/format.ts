/**
 * 时间与文本格式化工具。
 */

/**
 * 把毫秒时长格式化为中文可读文本：
 * 小于 60 秒时显示秒（保留一位小数），否则显示“X分Y秒”。
 */
export function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined || Number.isNaN(durationMs)) {
    return ''
  }

  if (durationMs < 60_000) {
    return `${(durationMs / 1000).toFixed(1)}s`
  }

  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}分${seconds}秒`
}

/**
 * 从任意错误值中提取可展示的消息文本。
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.trim() !== '') {
    return error
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    const message = (error as { message: string }).message
    if (message.trim() !== '') {
      return message
    }
  }

  return '未知错误'
}

/**
 * 取路径的文件名部分（兼容 Windows 与 POSIX 分隔符）。
 */
export function pathBasename(filePath: string): string {
  const normalized = filePath.replace(/[\\/]+$/, '')
  const segments = normalized.split(/[\\/]/)
  return segments[segments.length - 1] ?? ''
}
