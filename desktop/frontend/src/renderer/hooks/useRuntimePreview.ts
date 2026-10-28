import { useCallback, useEffect, useRef, useState } from 'react'
import type { RuntimePreview } from '../../shared/types'
import { desktop } from '../lib/desktop'
import { getErrorMessage } from '../lib/format'
import { useDialog } from '../contexts/DialogContext'

/**
 * 运行时预览结果按“项目路径 + 覆盖值”缓存，避免同一项目重复向 nvm 探测。
 */
const PREVIEW_CACHE = new Map<string, RuntimePreview>()

function cacheKey(projectPath: string, runtimeOverride: string): string {
  return `${projectPath}\u0000${runtimeOverride}`
}

export interface RuntimePreviewState {
  preview: RuntimePreview | null
  isLoading: boolean
  isInstalling: boolean
  refresh: () => Promise<void>
  install: () => Promise<void>
}

/**
 * 解析并缓存项目的有效运行时；node 项目才需要启用（脚本项目传 enabled=false）。
 */
export function useRuntimePreview(
  projectPath: string | null,
  runtimeOverride = '',
  enabled = true
): RuntimePreviewState {
  const { showAlert } = useDialog()
  const [preview, setPreview] = useState<RuntimePreview | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)
  const requestIdRef = useRef(0)

  const fetchPreview = useCallback(async (): Promise<RuntimePreview | null> => {
    if (!enabled || !projectPath) {
      return null
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setIsLoading(true)

    try {
      const next = await desktop.previewRuntime(projectPath, runtimeOverride)
      PREVIEW_CACHE.set(cacheKey(projectPath, runtimeOverride), next)
      if (requestIdRef.current === requestId) {
        setPreview(next)
      }
      return next
    } catch (error) {
      console.error('[runtime] 解析运行时失败:', error)
      if (requestIdRef.current === requestId) {
        setPreview(null)
      }
      return null
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }, [enabled, projectPath, runtimeOverride])

  useEffect(() => {
    if (!enabled || !projectPath) {
      requestIdRef.current += 1
      setPreview(null)
      setIsLoading(false)
      return
    }

    setPreview(PREVIEW_CACHE.get(cacheKey(projectPath, runtimeOverride)) ?? null)
    void fetchPreview()
  }, [enabled, fetchPreview, projectPath, runtimeOverride])

  const refresh = useCallback(async (): Promise<void> => {
    await fetchPreview()
  }, [fetchPreview])

  const install = useCallback(async (): Promise<void> => {
    const target = preview?.requested || preview?.version
    if (!target || isInstalling) {
      return
    }

    setIsInstalling(true)
    try {
      await desktop.installRuntime(target)
      await fetchPreview()
    } catch (error) {
      await showAlert(`安装 Node ${target} 失败：${getErrorMessage(error)}`, {
        title: '安装失败',
        tone: 'danger',
      })
    } finally {
      setIsInstalling(false)
    }
  }, [fetchPreview, isInstalling, preview, showAlert])

  return { preview, isLoading, isInstalling, refresh, install }
}
