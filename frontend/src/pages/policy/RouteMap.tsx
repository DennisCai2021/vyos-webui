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
  Select,
  message,
  Popconfirm,
  Tooltip,
  Row,
  Col,
  Divider,
  Tabs,
  Collapse,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SwapOutlined,
  FilterOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import type { RouteMap as RouteMapType, RouteMapRule, PrefixList, CommunityList } from '../../api/types'
import { networkApi } from '../../api/network'

const { Title, Text } = Typography
const { Option } = Select
const { Panel } = Collapse

interface RouteMapFormData {
  name: string
}

interface RuleFormData {
  sequence: number
  action: 'permit' | 'deny'
  description?: string
  // Match
  match_ip_address_prefix_list?: string
  match_ipv6_address_prefix_list?: string
  match_community?: string
  match_extcommunity?: string
  match_large_community?: string
  match_as_path?: string
  match_local_preference?: number
  match_metric?: number
  match_tag?: number
  match_interface?: string
  match_ip_next_hop?: string
  match_ip_route_source?: string
  match_peer?: string
  // Set
  set_local_preference?: number
  set_metric?: number
  set_metric_type?: 'type-1' | 'type-2'
  set_tag?: number
  set_weight?: number
  set_ip_next_hop?: string
  set_ip_nexthop_peer?: boolean
  set_as_path_prepend?: string
  set_as_path_exclude?: string
  set_as_path_replace?: string
  set_community?: string
  set_community_add?: string
  set_community_delete?: string
  set_extcommunity_rt?: string
  set_extcommunity_soo?: string
  set_large_community?: string
  set_large_community_add?: string
  set_large_community_delete?: string
  set_origin?: 'egp' | 'igp' | 'incomplete'
  set_distance?: number
  set_src?: string
}

export default function RouteMap() {
  const [loading, setLoading] = useState(false)
  const [routeMaps, setRouteMaps] = useState<RouteMapType[]>([])
  const [prefixLists, setPrefixLists] = useState<PrefixList[]>([])
  const [communityLists, setCommunityLists] = useState<CommunityList[]>([])

  // Modals
  const [routeMapModalVisible, setRouteMapModalVisible] = useState(false)
  const [ruleModalVisible, setRuleModalVisible] = useState(false)
  const [currentRouteMap, setCurrentRouteMap] = useState<string | null>(null)
  const [editingRule, setEditingRule] = useState<RouteMapRule | null>(null)

  const [routeMapForm] = Form.useForm<RouteMapFormData>()
  const [ruleForm] = Form.useForm<RuleFormData>()

  const loadData = async () => {
    setLoading(true)
    try {
      const [rmaps, plists, clists] = await Promise.all([
        networkApi.getRouteMaps(),
        networkApi.getPrefixLists(),
        networkApi.getCommunityLists(),
      ])
      setRouteMaps(rmaps)
      setPrefixLists(plists)
      setCommunityLists(clists)
    } catch (error: any) {
      console.error('Failed to load data:', error)
      message.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Route Maps
  const handleAddRouteMap = () => {
    routeMapForm.resetFields()
    setRouteMapModalVisible(true)
  }

  const handleRouteMapModalOk = async () => {
    const hide = message.loading('Creating route-map...', 0)
    try {
      await routeMapForm.validateFields()
      const values = await routeMapForm.getFieldsValue()

      await networkApi.createRouteMap(values.name)

      hide()
      message.success('Route-map created successfully!')
      setRouteMapModalVisible(false)
      loadData()
    } catch (error: any) {
      hide()
      console.error('Failed to create route-map:', error)
      message.error(`Create failed: ${error.message || 'Unknown error'}`)
    }
  }

  const handleDeleteRouteMap = async (name: string) => {
    try {
      await networkApi.deleteRouteMap(name)
      message.success('Route-map deleted')
      loadData()
    } catch (error: any) {
      console.error('Failed to delete route-map:', error)
      message.error(error.message || 'Failed to delete route-map')
    }
  }

  // Rules
  const handleAddRule = (routeMapName: string) => {
    setCurrentRouteMap(routeMapName)
    setEditingRule(null)
    ruleForm.resetFields()
    ruleForm.setFieldsValue({ action: 'permit' })
    setRuleModalVisible(true)
  }

  const handleRuleModalOk = async () => {
    if (!currentRouteMap) return

    const hide = message.loading('Adding rule...', 0)
    try {
      await ruleForm.validateFields()
      const values = await ruleForm.getFieldsValue()

      // Build match object
      const match: any = {}
      if (values.match_ip_address_prefix_list) match.ip_address_prefix_list = values.match_ip_address_prefix_list
      if (values.match_ipv6_address_prefix_list) match.ipv6_address_prefix_list = values.match_ipv6_address_prefix_list
      if (values.match_community) match.community = values.match_community
      if (values.match_extcommunity) match.extcommunity = values.match_extcommunity
      if (values.match_large_community) match.large_community = values.match_large_community
      if (values.match_as_path) match.as_path = values.match_as_path
      if (values.match_local_preference) match.local_preference = values.match_local_preference
      if (values.match_metric) match.metric = values.match_metric
      if (values.match_tag) match.tag = values.match_tag
      if (values.match_interface) match.interface = values.match_interface
      if (values.match_ip_next_hop) match.ip_next_hop = values.match_ip_next_hop
      if (values.match_ip_route_source) match.ip_route_source = values.match_ip_route_source
      if (values.match_peer) match.peer = values.match_peer

      // Build set object
      const set: any = {}
      if (values.set_local_preference) set.local_preference = values.set_local_preference
      if (values.set_metric) set.metric = values.set_metric
      if (values.set_metric_type) set.metric_type = values.set_metric_type
      if (values.set_tag) set.tag = values.set_tag
      if (values.set_weight) set.weight = values.set_weight
      if (values.set_ip_next_hop) set.ip_next_hop = values.set_ip_next_hop
      if (values.set_ip_nexthop_peer) set.ip_nexthop_peer = values.set_ip_nexthop_peer
      if (values.set_as_path_prepend) {
        set.as_path_prepend = values.set_as_path_prepend.split(/[, ]+/).filter(s => s)
      }
      if (values.set_as_path_exclude) set.as_path_exclude = values.set_as_path_exclude
      if (values.set_as_path_replace) set.as_path_replace = values.set_as_path_replace
      if (values.set_community) {
        set.community = values.set_community.split(/[, ]+/).filter(s => s)
      }
      if (values.set_community_add) {
        set.community_add = values.set_community_add.split(/[, ]+/).filter(s => s)
      }
      if (values.set_community_delete) {
        set.community_delete = values.set_community_delete.split(/[, ]+/).filter(s => s)
      }
      if (values.set_extcommunity_rt) {
        set.extcommunity_rt = values.set_extcommunity_rt.split(/[, ]+/).filter(s => s)
      }
      if (values.set_extcommunity_soo) {
        set.extcommunity_soo = values.set_extcommunity_soo.split(/[, ]+/).filter(s => s)
      }
      if (values.set_large_community) {
        set.large_community = values.set_large_community.split(/[, ]+/).filter(s => s)
      }
      if (values.set_large_community_add) {
        set.large_community_add = values.set_large_community_add.split(/[, ]+/).filter(s => s)
      }
      if (values.set_large_community_delete) {
        set.large_community_delete = values.set_large_community_delete.split(/[, ]+/).filter(s => s)
      }
      if (values.set_origin) set.origin = values.set_origin
      if (values.set_distance) set.distance = values.set_distance
      if (values.set_src) set.src = values.set_src

      const rule: RouteMapRule = {
        sequence: values.sequence,
        action: values.action,
        description: values.description,
      }
      if (Object.keys(match).length > 0) rule.match = match
      if (Object.keys(set).length > 0) rule.set = set

      await networkApi.addRouteMapRule(currentRouteMap, rule)

      hide()
      message.success('Rule added successfully!')
      setRuleModalVisible(false)
      loadData()
    } catch (error: any) {
      hide()
      console.error('Failed to add rule:', error)
      message.error(`Add failed: ${error.message || 'Unknown error'}`)
    }
  }

  const handleDeleteRule = async (routeMapName: string, sequence: number) => {
    try {
      await networkApi.deleteRouteMapRule(routeMapName, sequence)
      message.success('Rule deleted')
      loadData()
    } catch (error: any) {
      console.error('Failed to delete rule:', error)
      message.error(error.message || 'Failed to delete rule')
    }
  }

  // Render match/set summary
  const renderMatchSummary = (match: any) => {
    if (!match) return '-'
    const items: string[] = []
    if (match.ip_address_prefix_list) items.push(`prefix-list: ${match.ip_address_prefix_list}`)
    if (match.community) items.push(`community: ${match.community}`)
    if (match.as_path) items.push(`as-path: ${match.as_path}`)
    if (match.local_preference) items.push(`local-preference: ${match.local_preference}`)
    if (match.metric) items.push(`metric: ${match.metric}`)
    return items.length > 0 ? <Tag color="blue">{items.join(' | ')}</Tag> : '-'
  }

  const renderSetSummary = (set: any) => {
    if (!set) return '-'
    const items: string[] = []
    if (set.local_preference) items.push(`local-preference: ${set.local_preference}`)
    if (set.metric) items.push(`metric: ${set.metric}`)
    if (set.as_path_prepend) items.push(`as-path-prepend: ${set.as_path_prepend.join(',')}`)
    if (set.community) items.push(`community: ${set.community.join(',')}`)
    if (set.ip_next_hop) items.push(`next-hop: ${set.ip_next_hop}`)
    return items.length > 0 ? <Tag color="green">{items.join(' | ')}</Tag> : '-'
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          <Space>
            <SwapOutlined />
            Route Maps
          </Space>
        </Title>
        <Space>
          <Button
            type="default"
            icon={<ReloadOutlined />}
            onClick={loadData}
            loading={loading}
          >
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddRouteMap}>
            Create Route Map
          </Button>
        </Space>
      </div>

      {routeMaps.map((rm) => {
        // Create columns inside map to access rm.name in delete handler
        const columns = [
          {
            title: 'Sequence',
            dataIndex: 'sequence',
            key: 'sequence',
            width: 100,
          },
          {
            title: 'Action',
            dataIndex: 'action',
            key: 'action',
            width: 100,
            render: (action: string) => (
              <Tag color={action === 'permit' ? 'green' : 'orange'}>
                {action}
              </Tag>
            ),
          },
          {
            title: 'Description',
            dataIndex: 'description',
            key: 'description',
            render: (d: string) => d || '-',
          },
          {
            title: 'Match',
            key: 'match',
            render: (_: any, record: RouteMapRule) => renderMatchSummary(record.match),
          },
          {
            title: 'Set',
            key: 'set',
            render: (_: any, record: RouteMapRule) => renderSetSummary(record.set),
          },
          {
            title: 'Actions',
            key: 'actions',
            width: 100,
            render: (_: any, record: RouteMapRule) => (
              <Popconfirm
                title="Delete Rule"
                description="Are you sure?"
                onConfirm={() => handleDeleteRule(rm.name, record.sequence)}
                okText="Yes"
                cancelText="No"
              >
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]

        return (
          <Card
            key={rm.name}
            title={<Space><SwapOutlined /> {rm.name}</Space>}
            style={{ marginBottom: 16 }}
            extra={
              <Space>
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => handleAddRule(rm.name)}>
                  Add Rule
                </Button>
                <Popconfirm
                  title="Delete Route Map"
                  description="Are you sure?"
                  onConfirm={() => handleDeleteRouteMap(rm.name)}
                  okText="Yes"
                  cancelText="No"
                >
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            }
          >
            <Table
              dataSource={rm.rules}
              columns={columns}
              pagination={false}
              size="small"
              rowKey="sequence"
              locale={{
                emptyText: 'No rules configured',
              }}
            />
          </Card>
        )
      })}

      {/* Route Map Modal */}
      <Modal
        title="Create Route Map"
        open={routeMapModalVisible}
        onOk={handleRouteMapModalOk}
        onCancel={() => setRouteMapModalVisible(false)}
        width={500}
        okText="Create"
        cancelText="Cancel"
      >
        <Form form={routeMapForm} layout="vertical">
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'Please enter route-map name' }]}
          >
            <Input placeholder="e.g., RM-EXPORT" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Rule Modal */}
      <Modal
        title={editingRule ? 'Edit Rule' : 'Add Rule'}
        open={ruleModalVisible}
        onOk={handleRuleModalOk}
        onCancel={() => setRuleModalVisible(false)}
        width={800}
        okText="Save"
        cancelText="Cancel"
      >
        <Form form={ruleForm} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label="Sequence"
                name="sequence"
                rules={[{ required: true, message: 'Please enter sequence number' }]}
              >
                <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="10" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="Action"
                name="action"
                rules={[{ required: true, message: 'Please select action' }]}
              >
                <Select>
                  <Option value="permit">permit</Option>
                  <Option value="deny">deny</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="Description" name="description">
                <Input placeholder="Rule description (optional)" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">
            <Space><FilterOutlined /> Match Conditions</Space>
          </Divider>

          <Collapse ghost>
            <Panel header="IP / Prefix List" key="match-ip">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="IPv4 Prefix List" name="match_ip_address_prefix_list">
                    <Select placeholder="Select prefix list" allowClear>
                      {prefixLists.map(pl => (
                        <Option key={pl.name} value={pl.name}>{pl.name}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="IPv6 Prefix List" name="match_ipv6_address_prefix_list">
                    <Input placeholder="IPv6 prefix list name" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="Next Hop" name="match_ip_next_hop">
                    <Input placeholder="IP address" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Route Source" name="match_ip_route_source">
                    <Input placeholder="IP address" />
                  </Form.Item>
                </Col>
              </Row>
            </Panel>

            <Panel header="BGP Community / AS Path" key="match-bgp">
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="Community List" name="match_community">
                    <Select placeholder="Select community list" allowClear>
                      {communityLists.map(cl => (
                        <Option key={cl.name} value={cl.name}>{cl.name}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Extended Community" name="match_extcommunity">
                    <Input placeholder="Extended community list" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Large Community" name="match_large_community">
                    <Input placeholder="Large community list" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="AS Path" name="match_as_path">
                    <Input placeholder="AS path list name" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Peer" name="match_peer">
                    <Input placeholder="Peer IP address" />
                  </Form.Item>
                </Col>
              </Row>
            </Panel>

            <Panel header="Metrics" key="match-metrics">
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="Local Preference" name="match_local_preference">
                    <InputNumber style={{ width: '100%' }} placeholder="0-4294967295" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="MED" name="match_metric">
                    <InputNumber style={{ width: '100%' }} placeholder="0-4294967295" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Tag" name="match_tag">
                    <InputNumber style={{ width: '100%' }} placeholder="0-4294967295" />
                  </Form.Item>
                </Col>
              </Row>
            </Panel>

            <Panel header="Interface" key="match-interface">
              <Form.Item label="Interface" name="match_interface">
                <Input placeholder="Interface name" />
              </Form.Item>
            </Panel>
          </Collapse>

          <Divider orientation="left">
            <Space><SettingOutlined /> Set Actions</Space>
          </Divider>

          <Collapse ghost>
            <Panel header="BGP Attributes" key="set-bgp">
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="Local Preference" name="set_local_preference">
                    <InputNumber style={{ width: '100%' }} placeholder="0-4294967295" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Weight" name="set_weight">
                    <InputNumber style={{ width: '100%' }} placeholder="0-65535" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Origin" name="set_origin">
                    <Select placeholder="Select origin" allowClear>
                      <Option value="igp">igp</Option>
                      <Option value="egp">egp</Option>
                      <Option value="incomplete">incomplete</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="AS Path Prepend (comma/space separated)" name="set_as_path_prepend">
                    <Input placeholder="e.g., 65001, 65001" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="AS Path Replace" name="set_as_path_replace">
                    <Input placeholder="AS number" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="AS Path Exclude" name="set_as_path_exclude">
                    <Input placeholder="AS numbers to exclude" />
                  </Form.Item>
                </Col>
              </Row>
            </Panel>

            <Panel header="Next Hop" key="set-nexthop">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="Next Hop Address" name="set_ip_next_hop">
                    <Input placeholder="IP address" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Next Hop Peer" name="set_ip_nexthop_peer">
                    <Select placeholder="Use peer address as next hop" allowClear>
                      <Option value={true}>true</Option>
                      <Option value={false}>false</Option>
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
            </Panel>

            <Panel header="Metrics" key="set-metrics">
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="MED" name="set_metric">
                    <InputNumber style={{ width: '100%' }} placeholder="0-4294967295" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Metric Type" name="set_metric_type">
                    <Select placeholder="Select type" allowClear>
                      <Option value="type-1">type-1</Option>
                      <Option value="type-2">type-2</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Tag" name="set_tag">
                    <InputNumber style={{ width: '100%' }} placeholder="0-4294967295" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="Distance" name="set_distance">
                    <InputNumber style={{ width: '100%' }} placeholder="1-255" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Source" name="set_src">
                    <Input placeholder="Source address" />
                  </Form.Item>
                </Col>
              </Row>
            </Panel>

            <Panel header="Communities" key="set-community">
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="Community (set, comma/space separated)" name="set_community">
                    <Input placeholder="e.g., 65001:100, 65001:200" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Community Add" name="set_community_add">
                    <Input placeholder="e.g., 65001:100" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Community Delete" name="set_community_delete">
                    <Input placeholder="e.g., 65001:100" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="Extended Community RT" name="set_extcommunity_rt">
                    <Input placeholder="e.g., 65001:100" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Extended Community SoO" name="set_extcommunity_soo">
                    <Input placeholder="e.g., 65001:100" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="Large Community" name="set_large_community">
                    <Input placeholder="e.g., 65001:1:100" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Large Community Add" name="set_large_community_add">
                    <Input placeholder="e.g., 65001:1:100" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Large Community Delete" name="set_large_community_delete">
                    <Input placeholder="e.g., 65001:1:100" />
                  </Form.Item>
                </Col>
              </Row>
            </Panel>
          </Collapse>
        </Form>
      </Modal>
    </div>
  )
}
