import { useEffect, useMemo, useState, type FC } from 'react'
import type { RuntimeOption } from '../../shared/types'
import type { ProjectHistoryEntry, ProjectSettingsUpdate } from '../types'
import { desktop } from '../lib/desktop'
import { getErrorMessage } from '../lib/format'
import { useDialog } from '../contexts/DialogContext'
import { useRuntimePreview } from '../hooks/useRuntimePreview'
import RuntimeWarning from './RuntimeWarning'

interface ProjectSettingsDialogProps {
  project: ProjectHistoryEntry
  onClose: () => void
  onSave: (projectId: string, update: ProjectSettingsUpdate) => Promise<void>
}

/**
 * 项目设置弹窗：Node 项目可切换运行时，脚本项目可调整参数与工作目录。
 */
const ProjectSettingsDialog: FC<ProjectSettingsDialogProps> = ({
  project,
  onClose,
  onSave,
}) => {
  const { showAlert } = useDialog()
  const isScript = project.config.kind === 'script'
  const [runtimeOverride, setRuntimeOverride] = useState(project.runtimeOverride ?? '')
  const [runtimes, setRuntimes] = useState<RuntimeOption[]>([])
  const [args, setArgs] = useState(project.config.args ?? '')
  const [cwd, setCwd] = useState(project.config.cwd)
  const [isSaving, setIsSaving] = useState(false)

  const { preview, isInstalling, install } = useRuntimePreview(
    isScript ? null : project.path,
    runtimeOverride,
    !isScript
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    if (isScript) {
      return
    }

    let disposed = false
    desktop
      .listRuntimes()
      .then((options) => {
        if (!disposed) {
          setRuntimes(options)
        }
      })
      .catch((error: unknown) => {
        console.error('[settings] 读取运行时列表失败:', error)
      })

    return () => {
      disposed = true
    }
  }, [isScript])

  const installedRuntimes = useMemo(
    () => runtimes.filter((option) => option.version !== ''),
    [runtimes]
  )

  const overrideNotInstalled =
    runtimeOverride !== '' &&
    !installedRuntimes.some((option) => option.version === runtimeOverride)

  const handleSave = async () => {
    const trimmedCwd = cwd.trim()
    if (isScript && trimmedCwd === '') {
      await showAlert('工作目录不能为空。', { title: '无法保存' })
      return
    }

    setIsSaving(true)
    try {
      const update: ProjectSettingsUpdate = isScript
        ? {
            config: {
              ...project.config,
              kind: 'script',
              cwd: trimmedCwd,
              args: args.trim(),
            },
          }
        : { runtimeOverride }

      await onSave(project.id, update)
      onClose()
    } catch (error) {
      await showAlert(`保存项目设置失败：${getErrorMessage(error)}`, {
        title: '保存失败',
        tone: 'danger',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSaving) {
          onClose()
        }
      }}
    >
      <div
        className="modal-dialog form-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-settings-title"
      >
        <h2 className="modal-title" id="project-settings-title">
          项目设置
        </h2>
        <p className="modal-message">{project.name}</p>

        <div className="form-field">
          <span className="form-label">项目类型</span>
          <span className="form-static">{isScript ? '批处理脚本' : 'Node 项目'}</span>
        </div>

        <div className="form-field">
          <span className="form-label">项目路径</span>
          <span className="form-static mono">{project.path}</span>
        </div>

        {isScript ? (
          <>
            <label className="form-field">
              <span className="form-label">启动参数</span>
              <input
                className="form-input"
                type="text"
                value={args}
                onChange={(event) => setArgs(event.target.value)}
                placeholder="原样追加在脚本之后，可留空"
              />
            </label>
            <label className="form-field">
              <span className="form-label">工作目录</span>
              <input
                className="form-input"
                type="text"
                value={cwd}
                onChange={(event) => setCwd(event.target.value)}
                placeholder="默认为脚本所在目录"
              />
            </label>
            <p className="form-hint">脚本项目不注入 Node 运行时，使用系统默认环境运行。</p>
          </>
        ) : (
          <>
            <label className="form-field">
              <span className="form-label">Node 运行时</span>
              <select
                className="form-select"
                value={runtimeOverride}
                onChange={(event) => setRuntimeOverride(event.target.value)}
              >
                <option value="">自动（跟随项目）</option>
                {installedRuntimes.map((option) => (
                  <option key={option.version} value={option.version}>
                    {option.label || option.version}
                  </option>
                ))}
                {overrideNotInstalled ? (
                  <option value={runtimeOverride}>{runtimeOverride}（本机未安装）</option>
                ) : null}
              </select>
            </label>
            {preview && !preview.missing ? (
              <p className="form-hint">
                将使用：{preview.label}
                {preview.source ? `（来源：${preview.source}）` : ''}
              </p>
            ) : null}
            {preview?.missing ? (
              <RuntimeWarning
                preview={preview}
                isInstalling={isInstalling}
                onInstall={() => void install()}
              />
            ) : null}
            {preview?.note ? <p className="form-note">{preview.note}</p> : null}
          </>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="btn-secondary modal-action"
            disabled={isSaving}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="btn-primary modal-action"
            disabled={isSaving}
            onClick={() => void handleSave()}
          >
            {isSaving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProjectSettingsDialog
