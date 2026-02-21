import { useState, useEffect } from 'react'
import {
  Card,
  Row,
  Col,
  Statistic,
  Typography,
  Table,
  Tag,
  Progress,
  Button,
  Space,
  Alert,
  Dropdown,
  message,
} from 'antd'
import {
  CloudOutlined,
  DesktopOutlined,
  GlobalOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  SettingOutlined,
  WarningOutlined,
  PoweroffOutlined,
} from '@ant-design/icons'
import { systemApi, networkApi, FRONTEND_VERSION } from '../api'
import type { NetworkInterface, VersionResponse } from '../api/types'

const { Title, Text } = Typography

export default function Dashboard() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cpuUsage, setCpuUsage] = useState<number | null>(null)
  const [memoryUsage, setMemoryUsage] = useState<number | null>(null)
  const [diskUsage, setDiskUsage] = useState<number | null>(null)
  const [uptime, setUptime] = useState<string | null>(null)
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([])
  const [backendVersion, setBackendVersion] = useState<string | null>(null)

  const interfaceColumns = [
    {
      title: 'Interface',
      dataIndex: 'name',
      key: 'name',
      width: 120,
    },
    {
      title: 'IP Address',
      dataIndex: 'ip',
      key: 'ip',
      width: 180,
      render: (_: any, record: NetworkInterface) => {
        if (record.ip_addresses && record.ip_addresses.length > 0) {
          return record.ip_addresses.map((ip: any, idx: number) => (
            <div key={idx}>{ip.address || ip}</div>
          ))
        }
        return record.ip || '-'
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={status === 'up' ? 'green' : 'red'}>{status}</Tag>
      ),
    },
    {
      title: 'MAC Address',
      dataIndex: 'mac_address',
      key: 'mac_address',
      width: 160,
    },
    {
      title: 'MTU',
      dataIndex: 'mtu',
      key: 'mtu',
      width: 80,
    },
  ]

  const quickActionsMenu = [
    {
      key: 'backup',
      label: 'Backup Configuration',
      icon: <CloudOutlined />,
    },
    {
      key: 'update',
      label: 'Check for Updates',
      icon: <ReloadOutlined />,
    },
    {
      key: 'restart',
      label: 'Reboot System',
      icon: <PoweroffOutlined />,
      danger: true,
    },
  ]

  // Load dashboard data
  const loadDashboardData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [sysInfo, ifaces, versionInfo] = await Promise.all([
        systemApi.getInfo(),
        networkApi.getInterfaces(),
        systemApi.getVersion(),
      ])

      console.log('System info:', sysInfo)

      // Set versions
      setBackendVersion(versionInfo.backend_version)

      // Get uptime
      if (sysInfo.uptime?.uptime_string) {
        setUptime(sysInfo.uptime.uptime_string)
      }

      // Get CPU usage (from load average)
      if (sysInfo.uptime?.load_average_1m !== undefined) {
        const loadAvg = sysInfo.uptime.load_average_1m || 0
        const cpuCount = sysInfo.hardware?.cpu_cores || 1
        const cpuPercent = Math.min(100, Math.round((loadAvg / cpuCount) * 100))
        setCpuUsage(cpuPercent)
      }

      // Get memory usage
      if (sysInfo.hardware?.memory_used !== undefined && sysInfo.hardware?.memory_total && sysInfo.hardware.memory_total > 0) {
        const memPercent = Math.round((sysInfo.hardware.memory_used / sysInfo.hardware.memory_total) * 100)
        setMemoryUsage(memPercent)
      }

      // Get disk usage
      if (sysInfo.hardware?.disk_used !== undefined && sysInfo.hardware?.disk_total && sysInfo.hardware.disk_total > 0) {
        const diskPercent = Math.round((sysInfo.hardware.disk_used / sysInfo.hardware.disk_total) * 100)
        setDiskUsage(diskPercent)
      }

      setInterfaces(ifaces)
    } catch (error: any) {
      console.error('Failed to load dashboard data:', error)
      const errorMsg = error.message || 'Failed to load data from VyOS device'
      setError(errorMsg)
      message.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  // Initialize data
  useEffect(() => {
    loadDashboardData()

    // Refresh data every 30 seconds
    const refreshInterval = setInterval(() => {
      loadDashboardData()
    }, 30000)

    return () => {
      clearInterval(refreshInterval)
    }
  }, [])

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>
            Dashboard
          </Title>
          <Text type="secondary">System overview and monitoring</Text>
        </Col>
        <Col>
          <Space>
            <Button
              type="default"
              icon={<ReloadOutlined />}
              onClick={loadDashboardData}
              loading={loading}
            >
              Refresh
            </Button>
            <Dropdown menu={{ items: quickActionsMenu }} placement="bottomRight">
              <Button type="default" icon={<SettingOutlined />}>
                Quick Actions
              </Button>
            </Dropdown>
          </Space>
        </Col>
      </Row>

      {/* Error Alert */}
      {error && (
        <Alert
          message="Connection Error"
          description={error}
          type="error"
          showIcon
          icon={<WarningOutlined />}
          closable
          onClose={() => setError(null)}
          style={{ marginBottom: 24 }}
          action={
            <Button size="small" danger onClick={loadDashboardData}>
              Retry
            </Button>
          }
        />
      )}

      {/* System Status Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card
            bordered={false}
            styles={{ body: { padding: '20px' } }}
            hoverable
          >
            <Statistic
              title="System Uptime"
              value={uptime || '-'}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card
            bordered={false}
            styles={{ body: { padding: '20px' } }}
            hoverable
          >
            <Statistic
              title="CPU Usage"
              value={cpuUsage ?? '-'}
              suffix={cpuUsage !== null ? '%' : ''}
              prefix={<DesktopOutlined />}
              valueStyle={{ color: cpuUsage !== null && cpuUsage > 80 ? '#cf1322' : '#3f8600' }}
            />
            {cpuUsage !== null && (
              <Progress
                percent={cpuUsage}
                size="small"
                status={cpuUsage > 80 ? 'exception' : 'normal'}
                strokeColor={cpuUsage > 80 ? '#cf1322' : '#3f8600'}
                style={{ marginTop: 10 }}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card
            bordered={false}
            styles={{ body: { padding: '20px' } }}
            hoverable
          >
            <Statistic
              title="Memory Usage"
              value={memoryUsage ?? '-'}
              suffix={memoryUsage !== null ? '%' : ''}
              prefix={<CloudOutlined />}
              valueStyle={{ color: memoryUsage !== null && memoryUsage > 80 ? '#cf1322' : '#3f8600' }}
            />
            {memoryUsage !== null && (
              <Progress
                percent={memoryUsage}
                size="small"
                status={memoryUsage > 80 ? 'exception' : 'normal'}
                strokeColor={memoryUsage > 80 ? '#cf1322' : '#3f8600'}
                style={{ marginTop: 10 }}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card
            bordered={false}
            styles={{ body: { padding: '20px' } }}
            hoverable
          >
            <Statistic
              title="Disk Usage"
              value={diskUsage ?? '-'}
              suffix={diskUsage !== null ? '%' : ''}
              prefix={<GlobalOutlined />}
              valueStyle={{ color: diskUsage !== null && diskUsage > 80 ? '#cf1322' : '#3f8600' }}
            />
            {diskUsage !== null && (
              <Progress
                percent={diskUsage}
                size="small"
                status={diskUsage > 80 ? 'exception' : 'normal'}
                strokeColor={diskUsage > 80 ? '#cf1322' : '#3f8600'}
                style={{ marginTop: 10 }}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* Network Interfaces Table */}
      <Card
        title={
          <Space>
            <GlobalOutlined />
            <span>Network Interfaces</span>
          </Space>
        }
        bordered={false}
      >
        <Table
          dataSource={interfaces}
          columns={interfaceColumns}
          pagination={false}
          scroll={{ x: 800 }}
          size="middle"
          rowKey="name"
        />
      </Card>

      {/* Version Info */}
      <Card
        title="Version Info"
        bordered={false}
        style={{ marginTop: 16 }}
      >
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Space>
              <Text type="secondary" strong>Frontend Version:</Text>
              <Tag color="blue">{FRONTEND_VERSION}</Tag>
            </Space>
          </Col>
          <Col xs={24} sm={12}>
            <Space>
              <Text type="secondary" strong>Backend Version:</Text>
              <Tag color="green">{backendVersion || '-'}</Tag>
            </Space>
          </Col>
        </Row>
      </Card>
    </div>
  )
}
