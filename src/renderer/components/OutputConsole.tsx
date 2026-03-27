import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { List, type ListImperativeAPI, type RowComponentProps } from 'react-window'
import { OutputConsoleProps } from '../types'
import { desktop } from '../lib/desktop'

const URL_REGEX = /(https?:\/\/[^\s]+)/g
const OUTPUT_DEFAULT_HEIGHT = 400
const OUTPUT_ROW_HEIGHT = 24

const isErrorLine = (line: string): boolean => {
  const lower = line.toLowerCase()
  return (
    lower.includes('error') ||
    lower.includes('err:') ||
    lower.includes('failed') ||
    lower.includes('exception') ||
    lower.includes('uncaught')
  )
}

type OutputLineModel = {
  text: string
  searchText: string
  isError: boolean
}

function createOutputLineModel(text: string): OutputLineModel {
  return {
    text,
    searchText: text.toLowerCase(),
    isError: isErrorLine(text),
  }
}

function buildOutputLineModels(chunks: string[]): OutputLineModel[] {
  const lines: OutputLineModel[] = []
  let pendingLine = ''

  for (const chunk of chunks) {
    const normalizedChunk = chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const parts = normalizedChunk.split('\n')

    if (parts.length === 1) {
      pendingLine += parts[0]
      continue
    }

    pendingLine += parts[0]
    lines.push(createOutputLineModel(pendingLine))

    for (let index = 1; index < parts.length - 1; index += 1) {
      lines.push(createOutputLineModel(parts[index]))
    }

    pendingLine = parts[parts.length - 1]
  }

  if (pendingLine) {
    lines.push(createOutputLineModel(pendingLine))
  }

  return lines
}

type OutputRowProps = {
  lines: OutputLineModel[]
}

const OutputRow = memo(({ ariaAttributes, index, style, lines }: RowComponentProps<OutputRowProps>) => {
  const line = lines[index]
  const parts = line.text.split(URL_REGEX)

  return (
    <div
      {...ariaAttributes}
      style={{
        ...style,
        boxSizing: 'border-box',
        lineHeight: `${OUTPUT_ROW_HEIGHT}px`,
        overflow: 'hidden',
        paddingRight: '12px',
        whiteSpace: 'pre',
      }}
      className={`output-line ${line.isError ? 'output-line-error' : ''}`}
    >
      {parts.map((part, partIndex) => {
        if (partIndex % 2 === 1) {
          return (
            <a
              key={partIndex}
              href="#"
              className="output-link"
              onClick={(event) => {
                event.preventDefault()
                desktop.openInExplorer(part).catch((error) => {
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

  const outputLines = useMemo(() => {
    if (!serverState) {
      return []
    }

    return buildOutputLineModels(serverState.output)
  }, [serverState?.output])

  const normalizedKeyword = useMemo(() => {
    return searchKeyword.trim().toLowerCase()
  }, [searchKeyword])

  const filteredOutput = useMemo(() => {
    return outputLines.filter((line) => {
      if (onlyErrors && !line.isError) {
        return false
      }

      if (normalizedKeyword && !line.searchText.includes(normalizedKeyword)) {
        return false
      }

      return true
    })
  }, [normalizedKeyword, onlyErrors, outputLines])

  useEffect(() => {
    if (!listRef.current || filteredOutput.length === 0 || onlyErrors || normalizedKeyword) {
      return
    }

    listRef.current.scrollToRow({
      align: 'end',
      behavior: 'instant',
      index: filteredOutput.length - 1,
    })
  }, [filteredOutput.length, normalizedKeyword, onlyErrors, projectId])

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
    return (
      <div className="output-section">
        <div className="output-header">
          <h2>日志</h2>
        </div>
        <div className="output-console">
          <p className="output-empty">选择项目后显示日志</p>
        </div>
      </div>
    )
  }

  return (
    <div className="output-section">
      <div className="output-header">
        <h2>日志</h2>
        <div className="output-controls">
          <div className="output-search">
            <input
              type="text"
              placeholder="搜索日志"
              value={searchKeyword}
              onChange={handleSearchChange}
              className="search-input"
            />
            {searchKeyword && (
              <button className="search-clear" onClick={handleClearSearch} title="清空搜索">
                清空
              </button>
            )}
          </div>
          <button
            className={`btn-filter ${onlyErrors ? 'active' : ''}`}
            onClick={handleToggleErrors}
            title="只看错误日志"
          >
            仅错误
          </button>
        </div>
      </div>

      {(normalizedKeyword || onlyErrors) && (
        <p className="output-filter-hint">
          显示 {filteredOutput.length} / {outputLines.length} 条
        </p>
      )}

      <div className="output-console">
        {filteredOutput.length === 0 ? (
          <p className="output-empty">
            {onlyErrors || normalizedKeyword ? '没有匹配的日志' : '等待日志输出'}
          </p>
        ) : (
          <List
            key={projectId}
            className="output-list"
            defaultHeight={OUTPUT_DEFAULT_HEIGHT}
            listRef={listRef}
            overscanCount={12}
            rowComponent={OutputRow}
            rowCount={filteredOutput.length}
            rowHeight={OUTPUT_ROW_HEIGHT}
            rowProps={rowProps}
            style={{ height: '100%', width: '100%' }}
          />
        )}
      </div>
    </div>
  )
})

OutputConsole.displayName = 'OutputConsole'

export default OutputConsole
