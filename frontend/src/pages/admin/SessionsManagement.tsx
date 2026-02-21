/** Active sessions management component */

import { useState, useEffect } from 'react'
import {
  Table,
  Button,
  Space,
  Tag,
  message,
  Popconfirm,
  Tooltip,
  Typography,
  Card,
  Empty,
  Alert,
  Badge,
} from 'antd'
import {
  ReloadOutlined,
  LaptopOutlined,
  SafetyOutlined,
  StopOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { adminApi } from '../../api'
import type { Session } from '../../types'

const { Text } = Typography

export default function SessionsManagement() {
  const [loading, setLoading] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])

  const loadSessions = async () => {
    setLoading(true)
    try {
      const data = await adminApi.getSessions()
      setSessions(data)
    } catch (error) {
      message.error('Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSessions()
  }, [])

  const handleTerminateSession = async (session: Session) => {
    try {
      await adminApi.terminateSession(session.id)
      message.success('Session terminated')
      loadSessions()
    } catch (error) {
      message.error('Failed to terminate session')
    }
  }

  const handleTerminateAllSessions = async () => {
    try {
      await adminApi.terminateAllSessions()
      message.success('All other sessions terminated')
      loadSessions()
    } catch (error) {
      message.error('Failed to terminate sessions')
    }
  }

  const formatDuration = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} min ago`

    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours} hours ago`

    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays} days ago`
  }

  const columns: ColumnsType<Session> = [
    {
      title: 'User',
      dataIndex: 'username',
      key: 'username',
      width: 120,
      render: (username: string, record: Session) => (
        <Space>
          <LaptopOutlined />
          <Text strong={record.is_current}>{username}</Text>
          {record.is_current && <Tag color="green">Current</Tag>}
        </Space>
      ),
    },
    {
      title: 'IP Address',
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 140,
      render: (ip?: string) => ip ? <Text code>{ip}</Text> : '-',
    },
    {
      title: 'Browser / Device',
      dataIndex: 'user_agent',
      key: 'user_agent',
      render: (ua?: string) => {
        if (!ua) return '-'
        // Simplify user agent display
        const simplified = ua.split(' ').slice(0, 4).join(' ')
        return (
          <Tooltip title={ua}>
            <Text ellipsis style={{ maxWidth: 300 }}>{simplified}...</Text>
          </Tooltip>
        )
      },
    },
    {
      title: 'Started',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: 'Last Activity',
      dataIndex: 'last_accessed_at',
      key: 'last_accessed_at',
      width: 150,
      render: (date: string) => (
        <Space>
          <Badge status="success" />
          {formatDuration(date)}
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      fixed: 'right',
      render: (_: any, record: Session) => (
        !record.is_current ? (
          <Popconfirm
            title="Terminate Session"
            description="Are you sure you want to terminate this session?"
            onConfirm={() => handleTerminateSession(record)}
            okText="Yes"
            cancelText="No"
          >
            <Tooltip title="Terminate">
              <Button
                type="text"
                size="small"
                danger
                icon={<StopOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        ) : (
          <Text type="secondary">-</Text>
        )
      ),
    },
  ]

  const otherSessionsCount = sessions.filter(s => !s.is_current).length

  return (
    <div>
      <Alert
        message="Session Management"
        description="View and manage active user sessions. You can terminate other sessions if needed."
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Space>
          {otherSessionsCount > 0 && (
            <Popconfirm
              title="Terminate All Other Sessions"
              description="Are you sure you want to terminate all other sessions?"
              onConfirm={handleTerminateAllSessions}
              okText="Yes"
              cancelText="No"
            >
              <Button danger icon={<SafetyOutlined />}>
                Terminate All Others
              </Button>
            </Popconfirm>
          )}
          <Button icon={<ReloadOutlined />} onClick={loadSessions} loading={loading}>
            Refresh
          </Button>
        </Space>
      </div>

      <Card style={{ minHeight: 400 }}>
        <Table
          columns={columns}
          dataSource={sessions}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} sessions`,
          }}
          scroll={{ x: 900 }}
          locale={{
            emptyText: <Empty description="No active sessions" />,
          }}
        />
      </Card>
    </div>
  )
}
