/** Config Diff Display Component */

import { useState, useEffect } from 'react'
import { Card, Typography, Space, Button, Alert, message } from 'antd'
import { CopyOutlined, DownloadOutlined } from '@ant-design/icons'

const { Text } = Typography

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'header'
  content: string
  lineNumber?: number
}

interface ConfigDiffProps {
  oldConfig?: string
  newConfig?: string
  diff?: DiffLine[]
  title?: string
  showActions?: boolean
}

export function ConfigDiff({
  oldConfig,
  newConfig,
  diff,
  title = 'Configuration Changes',
  showActions = true,
}: ConfigDiffProps) {
  const [diffLines, setDiffLines] = useState<DiffLine[]>([])

  useEffect(() => {
    if (diff) {
      setDiffLines(diff)
    } else if (oldConfig && newConfig) {
      setDiffLines(generateDiff(oldConfig, newConfig))
    }
  }, [oldConfig, newConfig, diff])

  const generateDiff = (oldStr: string, newStr: string): DiffLine[] => {
    const oldLines = oldStr.split('\n')
    const newLines = newStr.split('\n')
    const lines: DiffLine[] = []

    lines.push({ type: 'header', content: '--- old-config' })
    lines.push({ type: 'header', content: '+++ new-config' })

    const maxLines = Math.max(oldLines.length, newLines.length)

    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i]
      const newLine = newLines[i]

      if (oldLine === newLine) {
        if (oldLine !== undefined) {
          lines.push({ type: 'unchanged', content: oldLine, lineNumber: i + 1 })
        }
      } else {
        if (oldLine !== undefined) {
          lines.push({ type: 'removed', content: oldLine, lineNumber: i + 1 })
        }
        if (newLine !== undefined) {
          lines.push({ type: 'added', content: newLine, lineNumber: i + 1 })
        }
      }
    }

    return lines
  }

  const handleCopy = () => {
    const text = diffLines.map(line => {
      switch (line.type) {
        case 'added': return `+ ${line.content}`
        case 'removed': return `- ${line.content}`
        case 'header': return line.content
        default: return `  ${line.content}`
      }
    }).join('\n')
    navigator.clipboard.writeText(text)
    message.success('Diff copied to clipboard')
  }

  const handleDownload = () => {
    const text = diffLines.map(line => {
      switch (line.type) {
        case 'added': return `+ ${line.content}`
        case 'removed': return `- ${line.content}`
        case 'header': return line.content
        default: return `  ${line.content}`
      }
    }).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `config-diff-${Date.now()}.txt`
    a.click()
  }

  const getLineStyle = (type: string) => {
    switch (type) {
      case 'added':
        return { background: '#f6ffed', color: '#52c41a' }
      case 'removed':
        return { background: '#fff1f0', color: '#ff4d4f' }
      case 'header':
        return { background: '#f0f0f0', fontWeight: 'bold', fontStyle: 'italic' }
      default:
        return {}
    }
  }

  return (
    <Card
      title={title}
      extra={showActions && (
        <Space>
          <Button icon={<CopyOutlined />} onClick={handleCopy} size="small">
            Copy
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleDownload} size="small">
            Download
          </Button>
        </Space>
      )}
    >
      <Alert
        message="Review Changes"
        description="Please review the configuration changes before applying"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <div style={{
        background: '#1e1e1e',
        padding: 16,
        borderRadius: 4,
        fontFamily: 'monospace',
        overflow: 'auto',
        maxHeight: 400,
      }}>
        {diffLines.map((line, index) => (
          <div key={index} style={{ ...getLineStyle(line.type), padding: '2px 8px' }}>
            <Text style={{ color: '#858585', marginRight: 8, minWidth: 40, display: 'inline-block' }}>
              {line.lineNumber || '  '}
            </Text>
            <Text>
              {line.type === 'added' && '+'}
              {line.type === 'removed' && '-'}
              {' '}
            </Text>
            <Text>{line.content}</Text>
          </div>
        ))}
      </div>
    </Card>
  )
}
