import { useState, useEffect } from 'react'
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Typography,
  message,
  Input,
  Select,
  Alert,
} from 'antd'
import {
  ReloadOutlined,
  DesktopOutlined,
  ClockCircleOutlined,
  ClearOutlined,
  InfoCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import type { ARPEntry } from '../../api/types'
import { networkApi } from '../../api'

const { Title, Text } = Typography
const { Search } = Input
const { Option } = Select

export default function ARP() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [arpTable, setArpTable] = useState<ARPEntry[]>([])
  const [filteredData, setFilteredData] = useState<ARPEntry[]>([])
  const [filterInterface, setFilterInterface] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')

  const loadARPTable = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await networkApi.getARPTable()
      setArpTable(data)
      applyFilters(data, filterInterface, filterType)
    } catch (error: any) {
      console.error('Failed to load ARP table:', error)
      const errorMsg = error.message || 'Failed to load ARP table from VyOS device'
      setError(errorMsg)
      message.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = (data: ARPEntry[], iface: string, type: string) => {
    let filtered = [...data]

    if (iface !== 'all') {
      filtered = filtered.filter((entry) => entry.interface === iface)
    }

    if (type !== 'all') {
      filtered = filtered.filter((entry) => entry.type === type)
    }

    setFilteredData(filtered)
  }

  useEffect(() => {
    loadARPTable()

    // Refresh ARP table every 30 seconds
    const interval = setInterval(loadARPTable, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleSearch = (value: string) => {
    const lowerValue = value.toLowerCase()
    const filtered = arpTable.filter(
      (entry) =>
        entry.ip_address.toLowerCase().includes(lowerValue) ||
        entry.mac_address.toLowerCase().includes(lowerValue) ||
        entry.interface.toLowerCase().includes(lowerValue)
    )
    applyFilters(filtered, filterInterface, filterType)
  }

  const handleInterfaceFilter = (value: string) => {
    setFilterInterface(value)
    applyFilters(arpTable, value, filterType)
  }

  const handleTypeFilter = (value: string) => {
    setFilterType(value)
    applyFilters(arpTable, filterInterface, value)
  }

  const handleFlushARP = async () => {
    try {
      await networkApi.flushARPTable()
      message.success('ARP cache flushed successfully')
      loadARPTable()
    } catch (error: any) {
      message.error(error.message || 'Failed to flush ARP cache')
    }
  }

  const formatMACAddress = (mac: string) => {
    return mac.toUpperCase().replace(/(.{2})(?!$)/g, '$1:')
  }

  const formatAge = (age?: number) => {
    if (age === undefined) return '-'
    if (age < 60) return `${age}s`
    if (age < 3600) return `${Math.floor(age / 60)}m`
    return `${Math.floor(age / 3600)}h`
  }

  const getUniqueInterfaces = () => {
    const interfaces = [...new Set(arpTable.map((entry) => entry.interface))]
    return interfaces.sort()
  }

  const columns = [
    {
      title: 'IP Address',
      dataIndex: 'ip_address',
      key: 'ip_address',
      fixed: 'left' as const,
      width: 160,
      render: (ip: string) => <Text code>{ip}</Text>,
    },
    {
      title: 'MAC Address',
      dataIndex: 'mac_address',
      key: 'mac_address',
      width: 180,
      render: (mac: string) => <Text code>{formatMACAddress(mac)}</Text>,
    },
    {
      title: 'Interface',
      dataIndex: 'interface',
      key: 'interface',
      width: 120,
      render: (iface: string) => <Tag color="blue">{iface}</Tag>,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: string) => (
        <Tag color={type === 'static' ? 'green' : 'orange'}>
          {type === 'static' ? 'Static' : 'Dynamic'}
        </Tag>
      ),
    },
    {
      title: 'Age',
      dataIndex: 'age',
      key: 'age',
      width: 100,
      render: (age?: number) => (
        <Space>
          <ClockCircleOutlined />
          <Text type="secondary">{formatAge(age)}</Text>
        </Space>
      ),
    },
  ]

  const getVendorInfo = (mac: string) => {
    const oui = mac.substring(0, 6)
    const vendors: Record<string, string> = {
      '00:11:22': 'VyOS Router',
      'aa:bb:cc': 'Sample Vendor A',
      '11:22:33': 'Sample Vendor B',
      '00:11:22:33:44:aa': 'Gateway Device',
    }
    return vendors[oui.toUpperCase().replace(/(.{2})(?!$)/g, '$1:')] || 'Unknown'
  }

  return (
    <div>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={2} style={{ margin: 0 }}>
              ARP Table
            </Title>
            <Text type="secondary">View and manage Address Resolution Protocol cache</Text>
          </div>
          <Space>
            <Button
              type="default"
              icon={<ReloadOutlined />}
              onClick={loadARPTable}
              loading={loading}
            >
              Refresh
            </Button>
            <Button
              danger
              icon={<ClearOutlined />}
              onClick={handleFlushARP}
            >
              Flush Cache
            </Button>
          </Space>
        </div>

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
            action={
              <Button size="small" danger onClick={loadARPTable}>
                Retry
              </Button>
            }
          />
        )}

        <Card bordered={false}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {/* Search and Filters */}
            <Space wrap style={{ width: '100%' }}>
              <Search
                placeholder="Search by IP, MAC, or interface..."
                allowClear
                style={{ width: 300 }}
                onSearch={handleSearch}
                onChange={(e) => e.target.value === '' && applyFilters(arpTable, filterInterface, filterType)}
              />

              <Select
                value={filterInterface}
                onChange={handleInterfaceFilter}
                style={{ width: 150 }}
                placeholder="Filter by interface"
              >
                <Option value="all">All Interfaces</Option>
                {getUniqueInterfaces().map((iface) => (
                  <Option key={iface} value={iface}>
                    {iface}
                  </Option>
                ))}
              </Select>

              <Select
                value={filterType}
                onChange={handleTypeFilter}
                style={{ width: 150 }}
                placeholder="Filter by type"
              >
                <Option value="all">All Types</Option>
                <Option value="dynamic">Dynamic</Option>
                <Option value="static">Static</Option>
              </Select>
            </Space>

            {/* Statistics */}
            <Space size="large">
              <Text type="secondary">
                <DesktopOutlined /> Total Entries: {filteredData.length}
              </Text>
              <Text type="secondary">
                <InfoCircleOutlined /> Static: {filteredData.filter((e) => e.type === 'static').length} /
                Dynamic: {filteredData.filter((e) => e.type === 'dynamic').length}
              </Text>
            </Space>

            {/* ARP Table */}
            <Table
              dataSource={filteredData}
              columns={columns}
              rowKey={(record) => `${record.ip_address}-${record.mac_address}`}
              loading={loading}
              pagination={{
                pageSize: 20,
                showSizeChanger: true,
                showTotal: (total) => `Total ${total} entries`,
              }}
              scroll={{ x: 800 }}
              size="middle"
              locale={{
                emptyText: 'No ARP entries found',
              }}
              expandable={{
                expandedRowRender: (record) => (
                  <div style={{ padding: '12px 24px', background: '#fafafa' }}>
                    <Space direction="vertical">
                      <Text strong>Vendor Information</Text>
                      <Text type="secondary">{getVendorInfo(record.mac_address)}</Text>
                      <div style={{ marginTop: 8 }}>
                        <Text type="secondary">Raw MAC: </Text>
                        <Text code>{record.mac_address}</Text>
                      </div>
                      {record.type === 'dynamic' && record.age && (
                        <div>
                          <Text type="secondary">Entry will expire in: </Text>
                          <Text>{formatAge(record.age)}</Text>
                        </div>
                      )}
                    </Space>
                  </div>
                ),
                rowExpandable: () => true,
              }}
            />
          </Space>
        </Card>

        {/* Information Card */}
        <Card title="About ARP" bordered={false}>
          <Space direction="vertical">
            <Text>
              The Address Resolution Protocol (ARP) is used to map IP addresses to MAC addresses
              on local networks.
            </Text>
            <ul style={{ margin: '8px 0', paddingLeft: 16 }}>
              <li>
                <Text>
                  <strong>Dynamic entries:</strong> Learned through ARP requests and expire after a timeout period
                </Text>
              </li>
              <li>
                <Text>
                  <strong>Static entries:</strong> Manually configured and do not expire
                </Text>
              </li>
              <li>
                <Text>
                  <strong>Flush cache:</strong> Removes all dynamic entries from the ARP table
                </Text>
              </li>
            </ul>
            <Text type="secondary">
              Use "Flush Cache" to clear all dynamic ARP entries and force the router to rediscover
              MAC addresses on the network.
            </Text>
          </Space>
        </Card>
      </Space>
    </div>
  )
}
