/** System Monitoring page with performance charts */

import { useState, useEffect } from 'react'
import {
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  Table,
  Button,
  Space,
  Select,
  Typography,
  Tag,
  Alert,
  Badge,
  List,
} from 'antd'
import {
  ReloadOutlined,
  ThunderboltOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  BellOutlined,
} from '@ant-design/icons'

const { Option } = Select
const { Title, Text } = Typography

interface MetricData {
  timestamp: number
  value: number
}

interface Alert {
  id: string
  severity: 'critical' | 'warning' | 'info'
  message: string
  timestamp: string
  acknowledged: boolean
}

export default function Monitoring() {
  const [loading, setLoading] = useState(false)
  const [timeRange, setTimeRange] = useState('1h')
  const [cpuHistory, setCpuHistory] = useState<MetricData[]>([])
  const [memoryHistory, setMemoryHistory] = useState<MetricData[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [currentCpu, setCurrentCpu] = useState(0)
  const [currentMemory, setCurrentMemory] = useState(0)
  const currentDisk = 62

  const generateMetricData = (points: number, min: number, max: number): MetricData[] => {
    const now = Date.now()
    const data: MetricData[] = []
    for (let i = points - 1; i >= 0; i--) {
      data.push({
        timestamp: now - i * 60000,
        value: Math.random() * (max - min) + min,
      })
    }
    return data
  }

  const loadMonitoringData = async () => {
    setLoading(true)
    try {
      const points = timeRange === '1h' ? 60 : timeRange === '24h' ? 144 : 720
      setCpuHistory(generateMetricData(points, 20, 80))
      setMemoryHistory(generateMetricData(points, 40, 70))
      setCurrentCpu(Math.round(Math.random() * 60 + 20))
      setCurrentMemory(Math.round(Math.random() * 40 + 40))
      setAlerts([
        {
          id: '1',
          severity: 'warning',
          message: 'High CPU usage detected on eth0',
          timestamp: new Date(Date.now() - 300000).toISOString(),
          acknowledged: false,
        },
        {
          id: '2',
          severity: 'info',
          message: 'BGP session established with 10.0.0.1',
          timestamp: new Date(Date.now() - 600000).toISOString(),
          acknowledged: true,
        },
        {
          id: '3',
          severity: 'critical',
          message: 'Disk space usage above 90%',
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          acknowledged: false,
        },
        {
          id: '4',
          severity: 'info',
          message: 'Configuration backup completed',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          acknowledged: true,
        },
      ])
    } catch (error) {
      console.error('Failed to load monitoring data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMonitoringData()
    const interval = setInterval(() => {
      setCurrentCpu(Math.round(Math.random() * 60 + 20))
      setCurrentMemory(Math.round(Math.random() * 40 + 40))
    }, 3000)
    return () => clearInterval(interval)
  }, [timeRange])

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'red'
      case 'warning': return 'orange'
      case 'info': return 'blue'
      default: return 'default'
    }
  }

  const interfaceData = [
    {
      key: 'eth0',
      name: 'eth0',
      status: 'up',
      rxBytes: 1258000000,
      txBytes: 982000000,
      rxRate: 125000,
      txRate: 89000,
      errors: 0,
      drops: 0,
    },
    {
      key: 'eth1',
      name: 'eth1',
      status: 'up',
      rxBytes: 452000000,
      txBytes: 156000000,
      rxRate: 45000,
      txRate: 12000,
      errors: 0,
      drops: 2,
    },
    {
      key: 'eth2',
      name: 'eth2',
      status: 'down',
      rxBytes: 0,
      txBytes: 0,
      rxRate: 0,
      txRate: 0,
      errors: 0,
      drops: 0,
    },
  ]

  const interfaceColumns = [
    {
      title: 'Interface',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'up' ? 'green' : 'red'}>
          {status === 'up' ? <CheckCircleOutlined /> : <WarningOutlined />}
          {' '}{status.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'RX Bytes',
      dataIndex: 'rxBytes',
      key: 'rxBytes',
      render: (bytes: number) => `${(bytes / 1000000).toFixed(2)} MB`,
    },
    {
      title: 'TX Bytes',
      dataIndex: 'txBytes',
      key: 'txBytes',
      render: (bytes: number) => `${(bytes / 1000000).toFixed(2)} MB`,
    },
    {
      title: 'RX Rate',
      dataIndex: 'rxRate',
      key: 'rxRate',
      render: (rate: number) => `${(rate / 1000).toFixed(2)} KB/s`,
    },
    {
      title: 'TX Rate',
      dataIndex: 'txRate',
      key: 'txRate',
      render: (rate: number) => `${(rate / 1000).toFixed(2)} KB/s`,
    },
    {
      title: 'Errors',
      dataIndex: 'errors',
      key: 'errors',
      render: (errors: number) => (
        <Text type={errors > 0 ? 'danger' : 'secondary'}>{errors}</Text>
      ),
    },
    {
      title: 'Drops',
      dataIndex: 'drops',
      key: 'drops',
      render: (drops: number) => (
        <Text type={drops > 0 ? 'danger' : 'secondary'}>{drops}</Text>
      ),
    },
  ]

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="CPU Usage"
              value={currentCpu}
              suffix="%"
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: currentCpu > 80 ? '#cf1322' : '#3f8600' }}
            />
            <Progress percent={currentCpu} status={currentCpu > 80 ? 'exception' : 'active'} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Memory Usage"
              value={currentMemory}
              suffix="%"
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: currentMemory > 80 ? '#cf1322' : '#3f8600' }}
            />
            <Progress percent={currentMemory} status={currentMemory > 80 ? 'exception' : 'active'} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Disk Usage"
              value={currentDisk}
              suffix="%"
              prefix={<DashboardOutlined />}
              valueStyle={{ color: currentDisk > 90 ? '#cf1322' : '#3f8600' }}
            />
            <Progress percent={currentDisk} status={currentDisk > 90 ? 'exception' : 'normal'} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Active Alerts"
              value={alerts.filter(a => !a.acknowledged).length}
              prefix={<BellOutlined />}
              valueStyle={{ color: alerts.filter(a => a.severity === 'critical' && !a.acknowledged).length > 0 ? '#cf1322' : '#faad14' }}
            />
            <Space>
              <Tag color="red">Critical: {alerts.filter(a => a.severity === 'critical' && !a.acknowledged).length}</Tag>
              <Tag color="orange">Warning: {alerts.filter(a => a.severity === 'warning' && !a.acknowledged).length}</Tag>
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={16}>
          <Card
            title="Performance Metrics"
            extra={
              <Space>
                <Select value={timeRange} onChange={setTimeRange} style={{ width: 120 }}>
                  <Option value="1h">Last 1 hour</Option>
                  <Option value="24h">Last 24 hours</Option>
                  <Option value="7d">Last 7 days</Option>
                </Select>
                <Button icon={<ReloadOutlined />} onClick={loadMonitoringData} loading={loading}>
                  Refresh
                </Button>
              </Space>
            }
          >
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Title level={5}>CPU History</Title>
                <div style={{
                  height: 200,
                  background: '#000',
                  borderRadius: 4,
                  padding: 8,
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 2,
                  overflow: 'hidden',
                }}>
                  {cpuHistory.slice(-60).map((point, i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        background: point.value > 70 ? '#ff4d4f' : point.value > 50 ? '#faad14' : '#52c41a',
                        height: `${point.value}%`,
                        minHeight: 4,
                        borderRadius: 2,
                      }}
                    />
                  ))}
                </div>
              </Col>
              <Col xs={24} md={12}>
                <Title level={5}>Memory History</Title>
                <div style={{
                  height: 200,
                  background: '#000',
                  borderRadius: 4,
                  padding: 8,
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 2,
                  overflow: 'hidden',
                }}>
                  {memoryHistory.slice(-60).map((point, i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        background: point.value > 80 ? '#ff4d4f' : point.value > 60 ? '#faad14' : '#1890ff',
                        height: `${point.value}%`,
                        minHeight: 4,
                        borderRadius: 2,
                      }}
                    />
                  ))}
                </div>
              </Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Recent Alerts">
            <List
              dataSource={alerts}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={
                      <Badge
                        status={item.severity === 'critical' ? 'error' : item.severity === 'warning' ? 'warning' : 'default'}
                      />
                    }
                    title={
                      <Space>
                        <Tag color={getSeverityColor(item.severity)}>{item.severity.toUpperCase()}</Tag>
                        {item.acknowledged && <Tag color="default">Acknowledged</Tag>}
                      </Space>
                    }
                    description={
                      <>
                        <div>{item.message}</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {new Date(item.timestamp).toLocaleString()}
                        </Text>
                      </>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Interface Statistics">
        <Table
          columns={interfaceColumns}
          dataSource={interfaceData}
          pagination={false}
          rowKey="key"
        />
      </Card>
    </div>
  )
}
