import React, { memo, useMemo } from 'react'
import { OutputConsoleProps } from '../types'

const OutputConsole: React.FC<OutputConsoleProps> = memo(({ projectId, serverState }) => {
  // 使用useMemo缓存renderOutputLine函数
  const renderOutputLine = useMemo(() => {
    const urlRegex = /(https?:\/\/[^\s]+)/g

    return (line: string, index: number) => {
      const parts = line.split(urlRegex)

      return (
        <div key={index} className="output-line">
          {parts.map((part, i) => {
            if (part.match(urlRegex)) {
              return (
                <a
                  key={i}
                  href="#"
                  className="output-link"
                  onClick={(e) => {
                    e.preventDefault()
                    window.electronAPI.openInExplorer(part).catch((error) => {
                      console.error('Failed to open URL:', error)
                    })
                  }}
                >
                  {part}
                </a>
              )
            }
            return <span key={i}>{part}</span>
          })}
        </div>
      )
    }
  }, []) // 空依赖数组，因为urlRegex是常量

  if (!projectId || !serverState) {
    return null
  }

  return (
    <div className="output-section">
      <h2>服务器输出</h2>
      <div className="output-console">
        {serverState.output.length === 0 ? (
          <p className="output-empty">// 等待输出...</p>
        ) : (
          serverState.output.map((line, index) =>
            renderOutputLine(line, index)
          )
        )}
      </div>
    </div>
  )
})

OutputConsole.displayName = 'OutputConsole'

export default OutputConsole
