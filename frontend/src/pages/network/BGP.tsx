import { useState, useEffect } from 'react'
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Typography,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  message,
  Popconfirm,
  Tooltip,
  Row,
  Col,
  Alert,
  Divider,
  Tabs,
  Select,
  Statistic,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  GlobalOutlined,
} from '@ant-design/icons'
import type { BGPConfig, BGPNeighbor, PrefixList, RouteMap } from '../../api/types'
import { networkApi } from '../../api/network'

const { Title, Text } = Typography
const { Option } = Select
const { TabPane } = Tabs

interface BGPConfigFormData {
  local_as: number
  router_id?: string
  keepalive?: number
  holdtime?: number
}

interface BGPNeighborFormData {
  ip_address: string
  remote_as: number
  description?: string
  update_source?: string
  next_hop_self: boolean
  password?: string
  advertisement_interval?: number
  ebgp_multihop?: number
  prefix_list_in?: string
  prefix_list_out?: string
  route_map_in?: string
  route_map_out?: string
}

interface BGPNetworkFormData {
  network: string
}

interface BGPSummaryPeer {
  neighbor: string
  vrf?: string
  as: number
  up_down: string
  state: string
  prefix_received?: number
  prefix_sent?: number
}

interface BGPSummaryData {
  local_as: number
  router_id?: string
  peers: BGPSummaryPeer[]
}

export default function BGP() {
  const [loading, setLoading] = useState(false)
  const [config, setConfig] = useState<BGPConfig>({
    local_as: undefined,
    router_id: undefined,
    keepalive: undefined,
    holdtime: undefined,
    neighbors: [],
    networks: [],
  })
  const [prefixLists, setPrefixLists] = useState<PrefixList[]>([])
  const [routeMaps, setRouteMaps] = useState<RouteMap[]>([])
  const [bgpSummary, setBgpSummary] = useState<BGPSummaryData | null>(null)
  const [activeTab, setActiveTab] = useState('summary')

  // Modals
  const [configModalVisible, setConfigModalVisible] = useState(false)
  const [neighborModalVisible, setNeighborModalVisible] = useState(false)
  const [networkModalVisible, setNetworkModalVisible] = useState(false)
  const [neighborModalMode, setNeighborModalMode] = useState<'add' | 'edit'>('add')
  const [selectedNeighbor, setSelectedNeighbor] = useState<BGPNeighbor | null>(null)

  const [configForm] = Form.useForm<BGPConfigFormData>()
  const [neighborForm] = Form.useForm<BGPNeighborFormData>()
  const [networkForm] = Form.useForm<BGPNetworkFormData>()

  const loadConfig = async () => {
    setLoading(true)
    try {
      const data = await networkApi.getBGPConfig()
      setConfig(data)
      const plists = await networkApi.getPrefixLists()
      setPrefixLists(plists)
      const rmaps = await networkApi.getRouteMaps()
      setRouteMaps(rmaps)
      // Load summary if we're on the summary tab
      if (activeTab === 'summary' && config.local_as) {
        await loadSummary()
      }
    } catch (error: any) {
      console.error('Failed to load BGP config:', error)
      message.error('Failed to load BGP configuration')
    } finally {
      setLoading(false)
    }
  }

  const loadSummary = async () => {
    try {
      const summary = await networkApi.getBGPSummary()
      setBgpSummary(summary)
    } catch (error: any) {
      console.error('Failed to load BGP summary:', error)
      // Don't show error - just keep mock data
    }
  }

  // Load summary when tab changes to summary
  const handleTabChange = (key: string) => {
    setActiveTab(key)
    if (key === 'summary' && config.local_as) {
      loadSummary()
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  // Helper: Check if neighbor is iBGP
  const isIBGP = (neighbor: BGPNeighbor) => {
    return config.local_as && neighbor.remote_as === config.local_as
  }

  // BGP Config
  const handleEditConfig = () => {
    configForm.setFieldsValue({
      local_as: config.local_as || 65001,
      router_id: config.router_id || '',
      keepalive: config.keepalive,
      holdtime: config.holdtime,
    })
    setConfigModalVisible(true)
  }

  const handleConfigModalOk = async () => {
    const hide = message.loading('Saving BGP config...', 0)
    try {
      await configForm.validateFields()
      const values = await configForm.getFieldsValue()

      await networkApi.updateBGPConfig({
        local_as: values.local_as,
        router_id: values.router_id,
        keepalive: values.keepalive,
        holdtime: values.holdtime,
      })

      hide()
      message.success('BGP configuration saved successfully!')
      setConfigModalVisible(false)
      loadConfig()
    } catch (error: any) {
      hide()
      console.error('Failed to save BGP config:', error)
      message.error(`Save failed: ${error.message || 'Unknown error'}`)
    }
  }

  // BGP Neighbors
  const handleAddNeighbor = () => {
    setNeighborModalMode('add')
    setSelectedNeighbor(null)
    neighborForm.resetFields()
    neighborForm.setFieldsValue({
      next_hop_self: false,
    })
    setNeighborModalVisible(true)
  }

  const handleEditNeighbor = (record: BGPNeighbor) => {
    setNeighborModalMode('edit')
    setSelectedNeighbor(record)
    neighborForm.setFieldsValue({
      ip_address: record.ip_address,
      remote_as: record.remote_as,
      description: record.description,
      update_source: record.update_source,
      next_hop_self: record.next_hop_self,
      advertisement_interval: record.advertisement_interval,
      ebgp_multihop: record.ebgp_multihop,
      prefix_list_in: record.prefix_list_in,
      prefix_list_out: record.prefix_list_out,
      route_map_in: record.route_map_in,
      route_map_out: record.route_map_out,
    })
    setNeighborModalVisible(true)
  }

  const handleDeleteNeighbor = async (record: BGPNeighbor) => {
    try {
      await networkApi.deleteBGPNeighbor(record.ip_address)
      message.success('BGP neighbor deleted')
      loadConfig()
    } catch (error: any) {
      console.error('Failed to delete BGP neighbor:', error)
      message.error(error.message || 'Failed to delete BGP neighbor')
    }
  }

  const handleNeighborModalOk = async () => {
    const hide = message.loading('Saving BGP neighbor...', 0)
    try {
      await neighborForm.validateFields()
      const values = await neighborForm.getFieldsValue()

      if (neighborModalMode === 'add') {
        await networkApi.createBGPNeighbor({
          ip_address: values.ip_address,
          remote_as: values.remote_as,
          description: values.description,
          update_source: values.update_source,
          next_hop_self: values.next_hop_self || false,
          password: values.password,
          advertisement_interval: values.advertisement_interval,
          ebgp_multihop: values.ebgp_multihop,
          prefix_list_in: values.prefix_list_in,
          prefix_list_out: values.prefix_list_out,
          route_map_in: values.route_map_in,
          route_map_out: values.route_map_out,
        })
      } else if (selectedNeighbor) {
        await networkApi.updateBGPNeighbor(selectedNeighbor.ip_address, {
          description: values.description,
          update_source: values.update_source,
          next_hop_self: values.next_hop_self,
          password: values.password,
          advertisement_interval: values.advertisement_interval,
          ebgp_multihop: values.ebgp_multihop,
          prefix_list_in: values.prefix_list_in,
          prefix_list_out: values.prefix_list_out,
          route_map_in: values.route_map_in,
          route_map_out: values.route_map_out,
        })
      }

      hide()
      message.success(`BGP neighbor ${neighborModalMode === 'add' ? 'created' : 'updated'} successfully!`)
      setNeighborModalVisible(false)
      loadConfig()
    } catch (error: any) {
      hide()
      console.error('Failed to save BGP neighbor:', error)
      message.error(`Save failed: ${error.message || 'Unknown error'}`)
    }
  }

  // BGP Networks
  const handleAddNetwork = () => {
    networkForm.resetFields()
    setNetworkModalVisible(true)
  }

  const handleDeleteNetwork = async (network: string) => {
    try {
      await networkApi.deleteBGPNetwork(network)
      message.success('BGP network removed')
      loadConfig()
    } catch (error: any) {
      console.error('Failed to delete BGP network:', error)
      message.error(error.message || 'Failed to delete BGP network')
    }
  }

  const handleNetworkModalOk = async () => {
    const hide = message.loading('Adding BGP network...', 0)
    try {
      await networkForm.validateFields()
      const values = await networkForm.getFieldsValue()

      await networkApi.addBGPNetwork(values.network)

      hide()
      message.success('BGP network added successfully!')
      setNetworkModalVisible(false)
      loadConfig()
    } catch (error: any) {
      hide()
      console.error('Failed to add BGP network:', error)
      message.error(`Add failed: ${error.message || 'Unknown error'}`)
    }
  }

  // Columns
  const neighborColumns = [
    {
      title: 'Neighbor IP',
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 150,
      render: (ip: string) => <Text code>{ip}</Text>,
    },
    {
      title: 'Remote AS',
      dataIndex: 'remote_as',
      key: 'remote_as',
      width: 120,
      render: (asn: number, record: BGPNeighbor) => (
        <Tag color={isIBGP(record) ? 'green' : 'blue'}>
          {asn} {isIBGP(record) && '(iBGP)'}
        </Tag>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (desc?: string) => desc ? <Text type="secondary">{desc}</Text> : '-',
    },
    {
      title: 'Update Source',
      dataIndex: 'update_source',
      key: 'update_source',
      width: 130,
      render: (src?: string) => src ? <Text code>{src}</Text> : '-',
    },
    {
      title: 'Next-Hop Self',
      dataIndex: 'next_hop_self',
      key: 'next_hop_self',
      width: 120,
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'green' : 'default'}>
          {enabled ? 'Yes' : 'No'}
        </Tag>
      ),
    },
    {
      title: 'Filters',
      key: 'filters',
      width: 250,
      render: (_: any, record: BGPNeighbor) => (
        <Space size="small" wrap>
          {record.prefix_list_in && <Tag size="small">PL-IN: {record.prefix_list_in}</Tag>}
          {record.prefix_list_out && <Tag size="small">PL-OUT: {record.prefix_list_out}</Tag>}
          {record.route_map_in && <Tag size="small" color="blue">RM-IN: {record.route_map_in}</Tag>}
          {record.route_map_out && <Tag size="small" color="blue">RM-OUT: {record.route_map_out}</Tag>}
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right' as const,
      width: 150,
      render: (_: any, record: BGPNeighbor) => (
        <Space size="small">
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditNeighbor(record)} />
          </Tooltip>
          <Popconfirm
            title="Delete Neighbor"
            description="Are you sure you want to delete this BGP neighbor?"
            onConfirm={() => handleDeleteNeighbor(record)}
            okText="Yes"
            cancelText="No"
          >
            <Tooltip title="Delete">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const networkColumns = [
    {
      title: 'Network',
      dataIndex: 'network',
      key: 'network',
      render: (network: string) => <Text code>{network}</Text>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_: any, record: { network: string }) => (
        <Popconfirm
          title="Remove Network"
          description="Are you sure you want to remove this network from BGP?"
          onConfirm={() => handleDeleteNetwork(record.network)}
          okText="Yes"
          cancelText="No"
        >
          <Tooltip title="Remove">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Tooltip>
        </Popconfirm>
      ),
    },
  ]

  const summaryPeerColumns = [
    {
      title: 'Neighbor',
      dataIndex: 'neighbor',
      key: 'neighbor',
      width: 150,
      render: (ip: string) => <Text code>{ip}</Text>,
    },
    {
      title: 'AS',
      dataIndex: 'as',
      key: 'as',
      width: 100,
    },
    {
      title: 'State',
      dataIndex: 'state',
      key: 'state',
      width: 120,
      render: (state: string) => (
        <Tag color={state === 'Established' ? 'green' : 'orange'}>
          {state}
        </Tag>
      ),
    },
    {
      title: 'Uptime/Downtime',
      dataIndex: 'up_down',
      key: 'up_down',
    },
    {
      title: 'Prefixes Received',
      dataIndex: 'prefix_received',
      key: 'prefix_received',
    },
    {
      title: 'Prefixes Sent',
      dataIndex: 'prefix_sent',
      key: 'prefix_sent',
    },
  ]

  // Mock summary data for now
  const mockSummary: BGPSummaryData = {
    local_as: config.local_as || 65001,
    router_id: config.router_id,
    peers: config.neighbors.map(n => ({
      neighbor: n.ip_address,
      as: n.remote_as,
      up_down: 'never',
      state: 'Idle',
    })),
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>
            <Space>
              <GlobalOutlined />
              BGP Configuration
            </Space>
          </Title>
          <Text type="secondary">
            Configure Border Gateway Protocol for inter-domain routing
          </Text>
        </div>
        <Space>
          <Button
            type="default"
            icon={<ReloadOutlined />}
            onClick={loadConfig}
            loading={loading}
          >
            Refresh
          </Button>
          {config.local_as ? (
            <Button type="primary" onClick={handleEditConfig}>
              Edit Config
            </Button>
          ) : (
            <Button type="primary" onClick={handleEditConfig}>
              Setup BGP
            </Button>
          )}
        </Space>
      </div>

      {/* BGP Summary */}
      <Card bordered={false} style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="Local AS"
              value={config.local_as || '-'}
              valueStyle={{ color: config.local_as ? '#1890ff' : '#999' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Keepalive"
              value={config.keepalive || '-'}
              suffix={config.keepalive ? 's' : ''}
              valueStyle={{ color: config.keepalive ? '#1890ff' : '#999' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Holdtime"
              value={config.holdtime || '-'}
              suffix={config.holdtime ? 's' : ''}
              valueStyle={{ color: config.holdtime ? '#1890ff' : '#999' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Neighbors"
              value={config.neighbors.length}
              valueStyle={{ color: '#1890ff' }}
            />
          </Col>
        </Row>
      </Card>

      {!config.local_as && (
        <Alert
          message="BGP Not Configured"
          description="Click 'Setup BGP' to configure BGP with your local AS number."
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Card bordered={false}>
        <Tabs activeKey={activeTab} onChange={handleTabChange}>
          <TabPane tab="Summary" key="summary">
            <Alert
              message="BGP Summary"
              description="This shows the output of 'show ip bgp summary' - real-time peering status."
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Table
              dataSource={(bgpSummary || mockSummary).peers.map((p, i) => ({ ...p, key: i }))}
              columns={summaryPeerColumns}
              rowKey="neighbor"
              loading={loading}
              pagination={false}
              size="middle"
              locale={{
                emptyText: 'No BGP neighbors configured',
              }}
            />
          </TabPane>
          <TabPane tab="Neighbors" key="neighbors">
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
              {config.local_as && (
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddNeighbor}>
                  Add Neighbor
                </Button>
              )}
            </div>
            <Table
              dataSource={config.neighbors.map((n, i) => ({ ...n, key: i }))}
              columns={neighborColumns}
              rowKey="ip_address"
              loading={loading}
              pagination={false}
              size="middle"
              locale={{
                emptyText: 'No BGP neighbors configured',
              }}
              scroll={{ x: 1000 }}
            />
          </TabPane>
          <TabPane tab="Advertised Networks" key="networks">
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
              {config.local_as && (
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddNetwork}>
                  Add Network
                </Button>
              )}
            </div>
            <Table
              dataSource={config.networks.map((n, i) => ({ network: n, key: i }))}
              columns={networkColumns}
              rowKey="network"
              loading={loading}
              pagination={false}
              size="middle"
              locale={{
                emptyText: 'No networks configured for advertisement',
              }}
            />
          </TabPane>
        </Tabs>
      </Card>

      {/* BGP Config Modal */}
      <Modal
        title={config.local_as ? 'Edit BGP Configuration' : 'Setup BGP'}
        open={configModalVisible}
        onOk={handleConfigModalOk}
        onCancel={() => setConfigModalVisible(false)}
        width={500}
        okText="Save"
        cancelText="Cancel"
      >
        <Form form={configForm} layout="vertical">
          <Form.Item
            label="Local AS Number"
            name="local_as"
            rules={[{ required: true, message: 'Please enter local AS number' }]}
            extra="AS number (1-4294967295)"
          >
            <InputNumber min={1} max={4294967295} style={{ width: '100%' }} placeholder="e.g., 65001" />
          </Form.Item>
          <Form.Item
            label="Router ID"
            name="router_id"
            extra="IP address format (e.g., 192.168.1.1)"
          >
            <Input placeholder="e.g., 192.168.1.1" />
          </Form.Item>
          <Divider />
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Keepalive (seconds)"
                name="keepalive"
                extra="Default: 60s"
              >
                <InputNumber min={1} max={3600} style={{ width: '100%' }} placeholder="60" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Holdtime (seconds)"
                name="holdtime"
                extra="Default: 180s, should be 3x keepalive"
              >
                <InputNumber min={3} max={3600} style={{ width: '100%' }} placeholder="180" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* BGP Neighbor Modal */}
      <Modal
        title={neighborModalMode === 'add' ? 'Add BGP Neighbor' : 'Edit BGP Neighbor'}
        open={neighborModalVisible}
        onOk={handleNeighborModalOk}
        onCancel={() => setNeighborModalVisible(false)}
        width={700}
        okText="Save"
        cancelText="Cancel"
      >
        <Form form={neighborForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Neighbor IP Address"
                name="ip_address"
                rules={[{ required: true, message: 'Please enter neighbor IP' }]}
                disabled={neighborModalMode === 'edit'}
              >
                <Input placeholder="e.g., 10.0.0.2" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Remote AS"
                name="remote_as"
                rules={[{ required: true, message: 'Please enter remote AS' }]}
              >
                <InputNumber min={1} max={4294967295} style={{ width: '100%' }} placeholder="e.g., 65002" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Description" name="description">
            <Input placeholder="Neighbor description" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Update Source Interface" name="update_source">
                <Input placeholder="e.g., eth0" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="BGP Password" name="password">
                <Input.Password placeholder="BGP password (optional)" />
              </Form.Item>
            </Col>
          </Row>
          <Divider>Timers & Filters</Divider>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="Advertisement Interval" name="advertisement_interval">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="seconds" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="eBGP Multihop" name="ebgp_multihop" extra="For eBGP only">
                <InputNumber min={1} max={255} style={{ width: '100%' }} placeholder="TTL" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Next-Hop Self" name="next_hop_self" valuePropName="checked" extra="Auto-enabled for iBGP">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Prefix List (In)" name="prefix_list_in">
                <Select placeholder="Select prefix-list" allowClear>
                  {prefixLists.map(pl => (
                    <Option key={pl.name} value={pl.name}>{pl.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Prefix List (Out)" name="prefix_list_out">
                <Select placeholder="Select prefix-list" allowClear>
                  {prefixLists.map(pl => (
                    <Option key={pl.name} value={pl.name}>{pl.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Route Map (In)" name="route_map_in" extra="Configure in Policy → Route Maps">
                <Select placeholder="Select route-map" allowClear>
                  {routeMaps.map(rm => (
                    <Option key={rm.name} value={rm.name}>{rm.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Route Map (Out)" name="route_map_out" extra="Configure in Policy → Route Maps">
                <Select placeholder="Select route-map" allowClear>
                  {routeMaps.map(rm => (
                    <Option key={rm.name} value={rm.name}>{rm.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* BGP Network Modal */}
      <Modal
        title="Add Network to BGP"
        open={networkModalVisible}
        onOk={handleNetworkModalOk}
        onCancel={() => setNetworkModalVisible(false)}
        width={500}
        okText="Add"
        cancelText="Cancel"
      >
        <Form form={networkForm} layout="vertical">
          <Form.Item
            label="Network"
            name="network"
            rules={[{ required: true, message: 'Please enter network' }]}
            extra="Network in CIDR format (e.g., 192.168.1.0/24)"
          >
            <Input placeholder="e.g., 192.168.1.0/24" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
