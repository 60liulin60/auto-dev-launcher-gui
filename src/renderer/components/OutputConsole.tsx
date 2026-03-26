import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { List, type ListImperativeAPI, type RowComponentProps } from 'react-window'
import { OutputConsoleProps } from '../types'

const URL_REGEX = /(https?:\/\/[^\s]+)/g
const OUTPUT_HEIGHT = 400
const OUTPUT_ROW_HEIGHT = 24

const isErrorLine = (line: string): boolean => {
  const lower = line.toLowerCase()
  return (
    lower.includes('error') ||
    lower.includes('err:') ||
    lower.includes('✗') ||
    lower.includes('failed') ||
    lower.includes('exception') ||
    lower.includes('uncaught')
  )
}

type OutputRowProps = {
  lines: string[]
}

const OutputRow = memo(({ ariaAttributes, index, style, lines }: RowComponentProps<OutputRowProps>) => {
  const line = lines[index]
  const parts = line.split(URL_REGEX)
  const lineIsError = isErrorLine(line)

  return (
    <div
      {...ariaAttributes}
      style={style}
      className={`output-line ${lineIsError ? 'output-line-error' : ''}`}
    >
      {parts.map((part, partIndex) => {
        if (part.match(URL_REGEX)) {
          return (
            <a
              key={partIndex}
              href="#"
              className="output-link"
              onClick={(event) => {
                event.preventDefault()
                window.electronAPI.openInExplorer(part).catch((error) => {
                  console.error('Failed to open URL:', error)
                })
              }}
            >
              {part}
            </a>
          )
        }

        return <span key={partIndex}>{part}</span>
      })}
    </div>
  )
})

OutputRow.displayName = 'OutputRow'

const OutputConsole: React.FC<OutputConsoleProps> = memo(({ projectId, serverState }) => {
  const listRef = useRef<ListImperativeAPI | null>(null)
  const [onlyErrors, setOnlyErrors] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')

  const filteredOutput = useMemo(() => {
    if (!serverState) {
      return []
    }

    let lines = serverState.output

    if (onlyErrors) {
      lines = lines.filter(isErrorLine)
    }

    if (searchKeyword.trim()) {
      const keyword = searchKeyword.trim().toLowerCase()
      lines = lines.filter((line) => line.toLowerCase().includes(keyword))
    }

    return lines
  }, [onlyErrors, searchKeyword, serverState])

  useEffect(() => {
    if (!listRef.current || filteredOutput.length === 0 || onlyErrors || searchKeyword) {
      return
    }

    listRef.current.scrollToRow({
      align: 'end',
      index: filteredOutput.length - 1,
    })
  }, [filteredOutput.length, onlyErrors, searchKeyword])

  const handleToggleErrors = useCallback(() => {
    setOnlyErrors((previous) => !previous)
  }, [])

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchKeyword(event.target.value)
  }, [])

  const handleClearSearch = useCallback(() => {
    setSearchKeyword('')
  }, [])

  const rowProps = useMemo<OutputRowProps>(() => ({
    lines: filteredOutput,
  }), [filteredOutput])

  if (!projectId || !serverState) {
    return null
  }

  return (
    <div className="output-section">
      <div className="output-header">
        <h2>服务器输出</h2>
        <div className="output-controls">
          <div className="output-search">
            <input
              type="text"
              placeholder="搜索日志..."
              value={searchKeyword}
              onChange={handleSearchChange}
              className="search-input"
            />
            {searchKeyword && (
              <button className="search-clear" onClick={handleClearSearch} title="清除搜索">
                ✕
              </button>
            )}
          </div>
          <button
            className={`btn-filter ${onlyErrors ? 'active' : ''}`}
            onClick={handleToggleErrors}
            title="仅显示错误行"
          >
            ⚠ 仅显示错误
          </button>
        </div>
      </div>

      {(searchKeyword || onlyErrors) && (
        <p className="output-filter-hint">
          共 {filteredOutput.length} / {serverState.output.length} 条
        </p>
      )}

      <div className="output-console">
        {filteredOutput.length === 0 ? (
          <p className="output-empty">
            {onlyErrors || searchKeyword ? '没有匹配的日志' : '// 等待输出...'}
          </p>
        ) : (
          <List
            listRef={listRef}
            rowComponent={OutputRow}
            rowCount={filteredOutput.length}
            rowHeight={OUTPUT_ROW_HEIGHT}
            rowProps={rowProps}
            style={{ height: OUTPUT_HEIGHT, width: '100%' }}
          />
        )}
      </div>
    </div>
  )
})

OutputConsole.displayName = 'OutputConsole'

export default OutputConsole
