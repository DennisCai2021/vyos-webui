/** System Info page */

import { useState, useEffect } from 'react'
import {
  Card,
  Row,
  Col,
  Descriptions,
  Progress,
  Statistic,
  Tag,
  Button,
  Space,
  message,
  Table,
  Typography,
} from 'antd'
import {
  ReloadOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  SafetyOutlined,
  GlobalOutlined,
} from '@ant-design/icons'
import { systemApi } from '../../api'
import type { SystemInfo as SystemInfoType, ServiceStatus } from '../../api/types'

const { Text } = Typography

export default function SystemInfo() {
  const [loading, setLoading] = useState(false)
  const [systemInfo, setSystemInfo] = useState<SystemInfoType | null>(null)
  const [services, setServices] = useState<ServiceStatus[]>([])

  const loadSystemInfo = async () => {
    setLoading(true)
    try {
      const [info, svcs] = await Promise.all([
        systemApi.getInfo(),
        systemApi.getServices(),
      ])
      setSystemInfo(info)
      setServices(svcs)
    } catch (error: any) {
      console.error('Failed to load system info:', error)
      const errorMsg = error.message || 'Failed to load system information'
      message.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSystemInfo()
  }, [])


  const serviceColumns = [
    {
      title: 'Service',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'running' ? 'green' : 'red'}>
          {status === 'running' ? <CheckCircleOutlined /> : <SafetyOutlined />}
          {' '}{status.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'PID',
      dataIndex: 'pid',
      key: 'pid',
      render: (pid: number) => pid || '-',
    },
    {
      title: 'CPU %',
      dataIndex: 'cpu_percent',
      key: 'cpu_percent',
      render: (cpu: number) => cpu ? `${cpu.toFixed(1)}%` : '-',
    },
    {
      title: 'Memory %',
      dataIndex: 'memory_percent',
      key: 'memory_percent',
      render: (mem: number) => mem ? `${mem.toFixed(1)}%` : '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: ServiceStatus) => (
        <Space>
          <Button size="small" type="link">
            {record.status === 'running' ? 'Stop' : 'Start'}
          </Button>
          <Button size="small" type="link">Restart</Button>
        </Space>
      ),
    },
  ]

  const memoryPercent = systemInfo?.hardware?.memory_total
    ? Math.round((systemInfo.hardware.memory_used! / systemInfo.hardware.memory_total) * 100)
    : 0

  const diskPercent = systemInfo?.hardware?.disk_total
    ? Math.round((systemInfo.hardware.disk_used! / systemInfo.hardware.disk_total) * 100)
    : 0

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Card
            title="System Overview"
            extra={
              <Button icon={<ReloadOutlined />} onClick={loadSystemInfo} loading={loading}>
                Refresh
              </Button>
            }
          >
            <Row gutter={16}>
              <Col xs={24} sm={12} md={6}>
                <Statistic
                  title="VyOS Version"
                  value={systemInfo?.version?.version || '-'}
                  prefix={<GlobalOutlined />}
                  loading={loading}
                />
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Statistic
                  title="Uptime"
                  value={systemInfo?.uptime?.uptime_string || '-'}
                  prefix={<ClockCircleOutlined />}
                  loading={loading}
                />
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Statistic
                  title="Load Average (1m)"
                  value={systemInfo?.uptime?.load_average_1m || 0}
                  precision={2}
                  loading={loading}
                />
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Statistic
                  title="Load Average (5m)"
                  value={systemInfo?.uptime?.load_average_5m || 0}
                  precision={2}
                  loading={loading}
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Version Information">
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Version">
                {systemInfo?.version?.version || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Description">
                {systemInfo?.version?.description || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Build Date">
                {systemInfo?.version?.build_date || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Kernel">
                {systemInfo?.version?.kernel || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Architecture">
                {systemInfo?.version?.architecture || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Serial Number">
                {systemInfo?.version?.serial_number || '-'}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Hardware Information">
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="CPU Model">
                {systemInfo?.hardware?.cpu_model || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="CPU Cores">
                {systemInfo?.hardware?.cpu_cores || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="CPU Speed">
                {systemInfo?.hardware?.cpu_speed || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="Memory">
                <Progress
                  percent={memoryPercent}
                  format={() => `${systemInfo?.hardware?.memory_used || 0} MB / ${systemInfo?.hardware?.memory_total || 0} MB`}
                />
              </Descriptions.Item>
              <Descriptions.Item label="Disk">
                <Progress
                  percent={diskPercent}
                  format={() => `${systemInfo?.hardware?.disk_used || 0} MB / ${systemInfo?.hardware?.disk_total || 0} MB`}
                />
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} lg={24}>
          <Card title="Services">
            <Table
              columns={serviceColumns}
              dataSource={services}
              rowKey="name"
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
