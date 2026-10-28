import { useEffect, useState, type FC } from 'react'
import type { DevConfig } from '../../shared/types'
import type { ScriptProjectDraft } from '../types'
import { desktop } from '../lib/desktop'
import { getErrorMessage, pathBasename } from '../lib/format'
import { useDialog } from '../contexts/DialogContext'

type Step = 'choose' | 'script'

interface AddProjectDialogProps {
  onClose: () => void
  onAddNodeProject: () => void
  onAddScriptProject: (draft: ScriptProjectDraft) => Promise<void>
}

function defaultScriptName(scriptPath: string): string {
  return pathBasename(scriptPath).replace(/\.[^.]+$/, '')
}

/**
 * 添加项目弹窗：先选择项目类型，再按类型收集配置。
 */
const AddProjectDialog: FC<AddProjectDialogProps> = ({
  onClose,
  onAddNodeProject,
  onAddScriptProject,
}) => {
  const { showAlert } = useDialog()
  const [step, setStep] = useState<Step>('choose')
  const [scriptPath, setScriptPath] = useState('')
  const [scriptConfig, setScriptConfig] = useState<DevConfig | null>(null)
  const [name, setName] = useState('')
  const [args, setArgs] = useState('')
  const [cwd, setCwd] = useState('')
  const [isPicking, setIsPicking] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleChooseNode = () => {
    onClose()
    onAddNodeProject()
  }

  const handlePickScript = async () => {
    setIsPicking(true)
    try {
      const selected = await desktop.selectScriptFile()
      if (!selected) {
        return
      }

      const loaded = await desktop.loadScriptConfig(selected)
      setScriptPath(selected)
      setScriptConfig(loaded)
      setName(loaded.name ?? defaultScriptName(selected))
      setArgs(loaded.args ?? '')
      setCwd(loaded.cwd)
      setStep('script')
    } catch (error) {
      await showAlert(`读取脚本失败：${getErrorMessage(error)}`, {
        title: '无法添加脚本',
        tone: 'danger',
      })
    } finally {
      setIsPicking(false)
    }
  }

  const handleBrowseCwd = async () => {
    try {
      const selected = await desktop.selectFolder()
      if (selected) {
        setCwd(selected)
      }
    } catch (error) {
      await showAlert(`选择工作目录失败：${getErrorMessage(error)}`, {
        title: '选择失败',
        tone: 'danger',
      })
    }
  }

  const handleSaveScript = async () => {
    if (!scriptConfig) {
      return
    }

    const trimmedCwd = cwd.trim()
    if (!trimmedCwd) {
      await showAlert('工作目录不能为空。', { title: '无法保存' })
      return
    }

    const trimmedName = name.trim() || defaultScriptName(scriptPath)
    const nextConfig: DevConfig = {
      ...scriptConfig,
      kind: 'script',
      name: trimmedName,
      command: scriptPath,
      cwd: trimmedCwd,
      args: args.trim(),
    }

    setIsSaving(true)
    try {
      await onAddScriptProject({
        path: scriptPath,
        name: trimmedName,
        config: nextConfig,
      })
      onClose()
    } catch (error) {
      await showAlert(`保存项目失败：${getErrorMessage(error)}`, {
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
        aria-labelledby="add-project-title"
      >
        <h2 className="modal-title" id="add-project-title">
          添加项目
        </h2>

        {step === 'choose' ? (
          <>
            <p className="modal-message">请选择要添加的项目类型。</p>
            <div className="add-project-options">
              <button
                type="button"
                className="add-project-option"
                onClick={handleChooseNode}
              >
                <strong>Node 项目</strong>
                <span>选择项目目录，读取 dev-config.json 等配置</span>
              </button>
              <button
                type="button"
                className="add-project-option"
                disabled={isPicking}
                onClick={() => void handlePickScript()}
              >
                <strong>批处理脚本</strong>
                <span>{isPicking ? '正在选择脚本…' : '选择 .bat / .cmd 脚本文件'}</span>
              </button>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary modal-action" onClick={onClose}>
                取消
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="modal-message">确认脚本信息后即可添加。</p>
            <label className="form-field">
              <span className="form-label">脚本文件</span>
              <span className="form-row">
                <input className="form-input" type="text" value={scriptPath} readOnly />
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={isPicking || isSaving}
                  onClick={() => void handlePickScript()}
                >
                  {isPicking ? '选择中…' : '重新选择'}
                </button>
              </span>
            </label>
            <label className="form-field">
              <span className="form-label">项目名称</span>
              <input
                className="form-input"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="用于列表展示的名称"
              />
            </label>
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
              <span className="form-row">
                <input
                  className="form-input"
                  type="text"
                  value={cwd}
                  onChange={(event) => setCwd(event.target.value)}
                  placeholder="默认为脚本所在目录"
                />
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={isSaving}
                  onClick={() => void handleBrowseCwd()}
                >
                  浏览…
                </button>
              </span>
            </label>
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
                onClick={() => void handleSaveScript()}
              >
                {isSaving ? '添加中…' : '添加项目'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default AddProjectDialog
