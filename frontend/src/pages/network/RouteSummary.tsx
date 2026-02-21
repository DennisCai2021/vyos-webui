import { useState, useEffect } from 'react'
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Typography,
  message,
  Tooltip,
} from 'antd'
import {
  ReloadOutlined,
  GroupOutlined,
  GlobalOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import type { RouteSummary } from '../../api/types'
import { networkApi } from '../../api'

const { Title, Text } = Typography

export default function RouteSummaryPage() {
  const [loading, setLoading] = useState(false)
  const [routesSummary, setRoutesSummary] = useState<RouteSummary[]>([])

  const loadRoutesSummary = async () => {
    setLoading(true)
    try {
      const data = await networkApi.getRoutesSummary()
      setRoutesSummary(data)
    } catch (error: any) {
      console.error('Failed to load routes summary:', error)
      message.error(error.message || 'Failed to load routing table summary')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRoutesSummary()
  }, [])

  const summaryColumns = [
    {
      title: 'Destination',
      dataIndex: 'destination',
      key: 'destination',
      width: 160,
      fixed: 'left' as const,
      render: (dest: string) => {
        const isDefault = dest === '0.0.0.0/0'
        return (
          <Space>
            {isDefault ? <GlobalOutlined /> : <GroupOutlined />}
            <Text code style={{ color: isDefault ? '#1890ff' : undefined }}>
              {dest}
            </Text>
          </Space>
        )
      },
    },
    {
      title: 'Next Hop',
      dataIndex: 'next_hop',
      key: 'next_hop',
      width: 130,
      render: (nextHop?: string) => <Text code>{nextHop || '-'}</Text>,
    },
    {
      title: 'Interface',
      dataIndex: 'interface',
      key: 'interface',
      width: 120,
      render: (iface?: string) => <Tag>{iface || '-'}</Tag>,
    },
    {
      title: 'Source',
      dataIndex: 'route_source',
      key: 'route_source',
      width: 160,
      render: (source: string, record: RouteSummary) => {
        let color = 'default'
        if (record.route_type === 'connected') color = 'green'
        if (record.route_type === 'static') color = 'blue'
        if (record.route_type === 'kernel') color = 'cyan'
        if (record.route_type === 'ospf' || record.route_type === 'isis' || record.route_type === 'bgp') color = 'orange'
        return <Tag color={color}>{source}</Tag>
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string, record: RouteSummary) => {
        let icon = null
        let color = 'default'
        if (status === 'active') {
          icon = <CheckCircleOutlined />
          color = 'success'
        } else if (status === 'selected') {
          icon = <EyeOutlined />
          color = 'processing'
        } else if (status === 'backup') {
          icon = <ClockCircleOutlined />
          color = 'warning'
        } else if (status === 'rejected') {
          icon = <CloseCircleOutlined />
          color = 'error'
        }
        return (
          <Tag color={color}>
            <Space size="small">
              {icon}
              {status}
            </Space>
          </Tag>
        )
      },
    },
    {
      title: 'Flags',
      dataIndex: 'flags',
      key: 'flags',
      width: 120,
      render: (_: any, record: RouteSummary) => {
        const flags = []
        if (record.is_selected) flags.push(<Tag key="s" color="blue">S</Tag>)
        if (record.is_fib) flags.push(<Tag key="f" color="green">FIB</Tag>)
        if (record.is_queued) flags.push(<Tag key="q" color="orange">Q</Tag>)
        if (record.is_rejected) flags.push(<Tag key="r" color="red">R</Tag>)
        if (record.is_backup) flags.push(<Tag key="b" color="default">B</Tag>)
        if (record.is_trapped) flags.push(<Tag key="t" color="purple">T</Tag>)
        return <Space size="small">{flags}</Space>
      },
    },
    {
      title: 'Age',
      dataIndex: 'age',
      key: 'age',
      width: 100,
      render: (age?: string) => age ? <Text type="secondary">{age}</Text> : '-',
    },
  ]

  return (
    <div>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={2} style={{ margin: 0 }}>
              Routing Table Summary
            </Title>
            <Text type="secondary">
              View complete routing table with route source and status information
            </Text>
          </div>
          <Space>
            <Button
              type="default"
              icon={<ReloadOutlined />}
              onClick={loadRoutesSummary}
              loading={loading}
            >
              Refresh
            </Button>
          </Space>
        </div>

        <Card bordered={false}>
          <Table
            dataSource={routesSummary}
            columns={summaryColumns}
            rowKey="destination"
            loading={loading}
            pagination={false}
            scroll={{ x: 1200 }}
            size="middle"
            locale={{
              emptyText: 'No routes in routing table',
            }}
          />
        </Card>
      </Space>
    </div>
  )
}
