/** Logs page with log query and real-time display */

import { useState, useEffect } from 'react'
import {
  Card,
  Form,
  Select,
  Input,
  Button,
  Table,
  Tag,
  Space,
  Badge,
  Divider,
  Drawer,
  Descriptions,
  Switch,
  Typography,
  message,
  Alert,
} from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  DownloadOutlined,
  ClearOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { logsApi } from '../../api'
import type { LogEntry } from '../../api/types'

const { Option } = Select
const { Text, Title } = Typography

const LOG_LEVELS = ['all', 'debug', 'info', 'notice', 'warning', 'error', 'critical']
const LOG_FACILITIES = ['all', 'system', 'kernel', 'auth', 'firewall', 'vpn']

export default function Logs() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [liveTail, setLiveTail] = useState(false)
  const [form] = Form.useForm()

  const loadLogs = async (filters: any = {}) => {
    setLoading(true)
    setError(null)
    try {
      const results = await logsApi.query({
        facility: filters.facility,
        level: filters.level,
        limit: 100,
      })
      let filtered = results

      if (filters.search) {
        filtered = filtered.filter(l =>
          l.message.toLowerCase().includes(filters.search.toLowerCase())
        )
      }

      setLogs(filtered)
    } catch (error: any) {
      console.error('Failed to load logs:', error)
      const errorMsg = error.message || 'Failed to load logs'
      setError(errorMsg)
      message.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLogs()
  }, [])

  // Disable live tail for now - requires SSE implementation
  useEffect(() => {
    if (liveTail) {
      message.info('Live tail feature is not yet implemented')
      setLiveTail(false)
    }
  }, [liveTail])

  const handleSearch = (values: any) => {
    loadLogs(values)
  }

  const handleViewLog = (log: LogEntry) => {
    setSelectedLog(log)
    setDrawerVisible(true)
  }

  const handleClearLogs = () => {
    setLogs([])
  }

  const handleExportLogs = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vyos-logs-${new Date().toISOString()}.json`
    a.click()
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
      case 'critical':
      case 'alert':
      case 'emergency':
        return 'red'
      case 'warning':
      case 'notice':
        return 'orange'
      case 'info':
        return 'blue'
      case 'debug':
        return 'gray'
      default:
        return 'default'
    }
  }

  const columns = [
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (ts: string) => new Date(ts).toLocaleString(),
    },
    {
      title: 'Facility',
      dataIndex: 'facility',
      key: 'facility',
      width: 120,
      render: (facility: string) => <Tag>{facility}</Tag>,
    },
    {
      title: 'Level',
      dataIndex: 'level',
      key: 'level',
      width: 100,
      render: (level: string) => (
        <Tag color={getLevelColor(level)}>{level.toUpperCase()}</Tag>
      ),
    },
    {
      title: 'Message',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
    },
    {
      title: 'Source',
      dataIndex: 'interface',
      key: 'interface',
      width: 100,
      render: (iface: string) => iface || '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: any, record: LogEntry) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => handleViewLog(record)}
        >
          View
        </Button>
      ),
    },
  ]

  return (
    <div>
      <Card
        title={
          <Space>
            Logs
            {liveTail && <Badge status="processing" text="Live" />}
          </Space>
        }
        extra={
          <Space>
            <Switch
              checked={liveTail}
              onChange={setLiveTail}
              checkedChildren={<PlayCircleOutlined />}
              unCheckedChildren={<PauseCircleOutlined />}
              disabled
            />
            <Button icon={<ReloadOutlined />} onClick={() => form.submit()} loading={loading}>
              Refresh
            </Button>
            <Button icon={<DownloadOutlined />} onClick={handleExportLogs} disabled={logs.length === 0}>
              Export
            </Button>
            <Button icon={<ClearOutlined />} danger onClick={handleClearLogs} disabled={logs.length === 0}>
              Clear
            </Button>
          </Space>
        }
      >
        {error && (
          <Alert
            message="Error Loading Logs"
            description={error}
            type="error"
            showIcon
            icon={<WarningOutlined />}
            closable
            onClose={() => setError(null)}
            style={{ marginBottom: 16 }}
            action={
              <Button size="small" danger onClick={() => loadLogs()}>
                Retry
              </Button>
            }
          />
        )}

        <Form
          form={form}
          layout="inline"
          onFinish={handleSearch}
          style={{ marginBottom: 16 }}
        >
          <Form.Item name="facility" label="Facility" initialValue="all">
            <Select style={{ width: 120 }}>
              {LOG_FACILITIES.map(f => (
                <Option key={f} value={f}>{f}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="level" label="Level" initialValue="all">
            <Select style={{ width: 120 }}>
              {LOG_LEVELS.map(l => (
                <Option key={l} value={l}>{l}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="search" label="Search">
            <Input placeholder="Search messages..." prefix={<SearchOutlined />} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>
              Search
            </Button>
          </Form.Item>
        </Form>

        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `Total ${total} entries`,
          }}
          scroll={{ x: 800 }}
        />
      </Card>

      <Drawer
        title="Log Entry Details"
        placement="right"
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
        width={600}
      >
        {selectedLog && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="ID">{selectedLog.id}</Descriptions.Item>
              <Descriptions.Item label="Timestamp">
                {new Date(selectedLog.timestamp).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="Facility">
                <Tag>{selectedLog.facility}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Level">
                <Tag color={getLevelColor(selectedLog.level)}>
                  {selectedLog.level.toUpperCase()}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Message">
                <Text>{selectedLog.message}</Text>
              </Descriptions.Item>
            </Descriptions>

            <Divider />
            <Title level={5}>Additional Details</Title>
            <Descriptions column={1} size="small">
              {selectedLog.interface && (
                <Descriptions.Item label="Source">
                  {selectedLog.interface}
                </Descriptions.Item>
              )}
              {(selectedLog as any).source_ip && (
                <Descriptions.Item label="Source IP">
                  {(selectedLog as any).source_ip}
                </Descriptions.Item>
              )}
              {(selectedLog as any).source_port && (
                <Descriptions.Item label="Source Port">
                  {(selectedLog as any).source_port}
                </Descriptions.Item>
              )}
              {(selectedLog as any).destination_ip && (
                <Descriptions.Item label="Destination IP">
                  {(selectedLog as any).destination_ip}
                </Descriptions.Item>
              )}
              {(selectedLog as any).destination_port && (
                <Descriptions.Item label="Destination Port">
                  {(selectedLog as any).destination_port}
                </Descriptions.Item>
              )}
              {(selectedLog as any).action && (
                <Descriptions.Item label="Action">
                  <Tag color={(selectedLog as any).action === 'drop' ? 'red' : 'green'}>
                    {(selectedLog as any).action.toUpperCase()}
                  </Tag>
                </Descriptions.Item>
              )}
            </Descriptions>
          </>
        )}
      </Drawer>
    </div>
  )
}
