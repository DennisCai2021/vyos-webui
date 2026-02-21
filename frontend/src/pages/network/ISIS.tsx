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
  Divider,
  Tabs,
  Select,
  Alert,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  ApiOutlined,
} from '@ant-design/icons'
import type { ISISConfig, ISISInterface, ISISRedistribute, RouteMap } from '../../api/types'
import { networkApi } from '../../api/network'

const { Title, Text } = Typography
const { Option } = Select
const { TabPane } = Tabs

interface ISISGlobalFormData {
  net?: string
  level?: string
  metric_style?: string
  purge_originator?: boolean
  set_overload_bit?: boolean
  spf_interval?: number
  // For initial setup
  initial_interface?: string
  initial_interface_circuit_type?: string
  initial_interface_metric?: number
  initial_interface_passive?: boolean
}

interface ISISInterfaceFormData {
  interface: string
  circuit_type?: string
  hello_interval?: number
  hello_multiplier?: number
  metric?: number
  passive?: boolean
  priority?: number
}

interface ISISRedistributeFormData {
  source: string
  level: string
  route_map?: string
}

interface ISISStatusData {
  net?: string
  level?: string
  interfaces: Array<{
    interface: string
    circ_id?: string
    state?: string
    type?: string
    level?: string
  }>
  database: Array<{
    lsp_id: string
    local: boolean
    pdu_len?: string
    seq_number?: string
    chksum?: string
    holdtime?: string
    flags?: string
    level: string
  }>
}

export default function ISIS() {
  const [loading, setLoading] = useState(false)
  const [config, setConfig] = useState<ISISConfig>({
    net: undefined,
    level: undefined,
    metric_style: undefined,
    purge_originator: false,
    set_overload_bit: false,
    ldp_sync: false,
    ldp_sync_holddown: undefined,
    spf_interval: undefined,
    interfaces: [],
    redistribute: [],
  })
  const [routeMaps, setRouteMaps] = useState<RouteMap[]>([])
  const [isisStatus, setIsisStatus] = useState<ISISStatusData | null>(null)
  const [activeTab, setActiveTab] = useState('interfaces')

  // Modals
  const [configModalVisible, setConfigModalVisible] = useState(false)
  const [interfaceModalVisible, setInterfaceModalVisible] = useState(false)
  const [redistributeModalVisible, setRedistributeModalVisible] = useState(false)
  const [interfaceModalMode, setInterfaceModalMode] = useState<'add' | 'edit'>('add')
  const [selectedInterface, setSelectedInterface] = useState<string | null>(null)

  const [configForm] = Form.useForm<ISISGlobalFormData>()
  const [interfaceForm] = Form.useForm<ISISInterfaceFormData>()
  const [redistributeForm] = Form.useForm<ISISRedistributeFormData>()

  const loadConfig = async () => {
    setLoading(true)
    try {
      const data = await networkApi.getISISConfig()
      setConfig(data)
      const rmaps = await networkApi.getRouteMaps()
      setRouteMaps(rmaps)
      // Load status if we're on the status tab
      if (activeTab === 'status' && config.net) {
        await loadStatus()
      }
    } catch (error: any) {
      console.error('Failed to load ISIS config:', error)
      message.error('Failed to load ISIS configuration')
    } finally {
      setLoading(false)
    }
  }

  const loadStatus = async () => {
    try {
      const status = await networkApi.getISISStatus()
      setIsisStatus(status)
    } catch (error: any) {
      console.error('Failed to load ISIS status:', error)
    }
  }

  // Load status when tab changes to status
  const handleTabChange = (key: string) => {
    setActiveTab(key)
    if (key === 'status' && config.net) {
      loadStatus()
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  // Global Config
  const handleEditConfig = () => {
    configForm.setFieldsValue({
      net: config.net || '',
      level: config.level,
      metric_style: config.metric_style,
      purge_originator: config.purge_originator,
      set_overload_bit: config.set_overload_bit,
      spf_interval: config.spf_interval,
    })
    setConfigModalVisible(true)
  }

  const handleDisableISIS = async () => {
    try {
      await networkApi.disableISIS()
      message.success('IS-IS disabled')
      loadConfig()
    } catch (error: any) {
      console.error('Failed to disable ISIS:', error)
      message.error(error.message || 'Failed to disable ISIS')
    }
  }

  const handleConfigModalOk = async () => {
    const hide = message.loading('Saving ISIS config...', 0)
    try {
      await configForm.validateFields()
      const values = await configForm.getFieldsValue()

      if (!config.net && values.net && values.initial_interface) {
        // Initial setup - use the setup endpoint to create both net and interface in one commit
        await networkApi.setupISIS({
          net: values.net,
          level: values.level,
          metric_style: values.metric_style,
          interface: values.initial_interface,
          interface_circuit_type: values.initial_interface_circuit_type,
          interface_metric: values.initial_interface_metric,
          interface_passive: values.initial_interface_passive || false,
        })
      } else {
        // Regular update
        await networkApi.updateISISConfig({
          net: values.net || undefined,
          level: values.level,
          metric_style: values.metric_style,
          purge_originator: values.purge_originator,
          set_overload_bit: values.set_overload_bit,
          spf_interval: values.spf_interval,
        })
      }

      hide()
      message.success('ISIS configuration saved successfully!')
      setConfigModalVisible(false)
      loadConfig()
    } catch (error: any) {
      hide()
      console.error('Failed to save ISIS config:', error)
      message.error(`Save failed: ${error.message || error.response?.data?.detail || 'Unknown error'}`)
    }
  }

  // Interfaces
  const handleAddInterface = () => {
    setInterfaceModalMode('add')
    setSelectedInterface(null)
    interfaceForm.resetFields()
    interfaceForm.setFieldsValue({
      passive: false,
    })
    setInterfaceModalVisible(true)
  }

  const handleEditInterface = (record: ISISInterface) => {
    setInterfaceModalMode('edit')
    setSelectedInterface(record.name)
    interfaceForm.setFieldsValue({
      interface: record.name,
      circuit_type: record.circuit_type,
      hello_interval: record.hello_interval,
      hello_multiplier: record.hello_multiplier,
      metric: record.metric,
      passive: record.passive,
      priority: record.priority,
    })
    setInterfaceModalVisible(true)
  }

  const handleDeleteInterface = async (record: ISISInterface) => {
    try {
      await networkApi.deleteISISInterface(record.name)
      message.success('IS-IS interface removed')
      loadConfig()
    } catch (error: any) {
      console.error('Failed to remove ISIS interface:', error)
      message.error(error.message || 'Failed to remove ISIS interface')
    }
  }

  const handleInterfaceModalOk = async () => {
    const hide = message.loading('Saving ISIS interface...', 0)
    try {
      await interfaceForm.validateFields()
      const values = await interfaceForm.getFieldsValue()

      if (interfaceModalMode === 'add') {
        await networkApi.addISISInterface({
          interface: values.interface,
          circuit_type: values.circuit_type,
          hello_interval: values.hello_interval,
          hello_multiplier: values.hello_multiplier,
          metric: values.metric,
          passive: values.passive,
          priority: values.priority,
        })
      } else if (selectedInterface) {
        await networkApi.updateISISInterface(selectedInterface, {
          circuit_type: values.circuit_type,
          hello_interval: values.hello_interval,
          hello_multiplier: values.hello_multiplier,
          metric: values.metric,
          passive: values.passive,
          priority: values.priority,
        })
      }

      hide()
      message.success(`ISIS interface ${interfaceModalMode === 'add' ? 'added' : 'updated'} successfully!`)
      setInterfaceModalVisible(false)
      loadConfig()
    } catch (error: any) {
      hide()
      console.error('Failed to save ISIS interface:', error)
      message.error(`Save failed: ${error.message || 'Unknown error'}`)
    }
  }

  // Redistribution
  const handleAddRedistribute = () => {
    redistributeForm.resetFields()
    setRedistributeModalVisible(true)
  }

  const handleDeleteRedistribute = async (record: ISISRedistribute) => {
    try {
      await networkApi.deleteISISRedistribute(record.source, record.level)
      message.success('Redistribution removed')
      loadConfig()
    } catch (error: any) {
      console.error('Failed to remove redistribution:', error)
      message.error(error.message || 'Failed to remove redistribution')
    }
  }

  const handleRedistributeModalOk = async () => {
    const hide = message.loading('Adding redistribution...', 0)
    try {
      await redistributeForm.validateFields()
      const values = await redistributeForm.getFieldsValue()

      await networkApi.addISISRedistribute({
        source: values.source,
        level: values.level,
        route_map: values.route_map,
      })

      hide()
      message.success('Redistribution added successfully!')
      setRedistributeModalVisible(false)
      loadConfig()
    } catch (error: any) {
      hide()
      console.error('Failed to add redistribution:', error)
      message.error(`Add failed: ${error.message || 'Unknown error'}`)
    }
  }

  // Columns
  const interfaceColumns = [
    {
      title: 'Interface',
      dataIndex: 'name',
      key: 'name',
      width: 150,
      render: (name: string) => <Text code>{name}</Text>,
    },
    {
      title: 'Circuit Type',
      dataIndex: 'circuit_type',
      key: 'circuit_type',
      width: 150,
      render: (ct?: string) => ct ? <Tag color="blue">{ct}</Tag> : '-',
    },
    {
      title: 'Metric',
      dataIndex: 'metric',
      key: 'metric',
      width: 100,
      render: (m?: number) => m || '-',
    },
    {
      title: 'Hello Interval',
      dataIndex: 'hello_interval',
      key: 'hello_interval',
      width: 130,
      render: (hi?: number) => hi ? `${hi}s` : '-',
    },
    {
      title: 'Passive',
      dataIndex: 'passive',
      key: 'passive',
      width: 100,
      render: (p: boolean) => (
        <Tag color={p ? 'orange' : 'green'}>
          {p ? 'Yes' : 'No'}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right' as const,
      width: 150,
      render: (_: any, record: ISISInterface) => (
        <Space size="small">
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditInterface(record)} />
          </Tooltip>
          <Popconfirm
            title="Remove Interface"
            description="Are you sure you want to remove this interface from ISIS?"
            onConfirm={() => handleDeleteInterface(record)}
            okText="Yes"
            cancelText="No"
          >
            <Tooltip title="Remove">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const redistributeColumns = [
    {
      title: 'Source',
      dataIndex: 'source',
      key: 'source',
      width: 150,
      render: (s: string) => <Tag color="blue">{s}</Tag>,
    },
    {
      title: 'Level',
      dataIndex: 'level',
      key: 'level',
      width: 150,
      render: (l: string) => <Tag color="green">{l}</Tag>,
    },
    {
      title: 'Route Map',
      dataIndex: 'route_map',
      key: 'route_map',
      render: (rm?: string) => rm ? <Text code>{rm}</Text> : '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_: any, record: ISISRedistribute) => (
        <Popconfirm
          title="Remove Redistribution"
          description="Are you sure?"
          onConfirm={() => handleDeleteRedistribute(record)}
          okText="Yes"
          cancelText="No"
        >
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  const statusInterfaceColumns = [
    {
      title: 'Interface',
      dataIndex: 'interface',
      key: 'interface',
      width: 150,
      render: (name: string) => <Text code>{name}</Text>,
    },
    {
      title: 'Circ ID',
      dataIndex: 'circ_id',
      key: 'circ_id',
      width: 100,
    },
    {
      title: 'State',
      dataIndex: 'state',
      key: 'state',
      width: 100,
      render: (state: string) => (
        <Tag color={state === 'Up' ? 'green' : 'orange'}>
          {state}
        </Tag>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 100,
    },
    {
      title: 'Level',
      dataIndex: 'level',
      key: 'level',
      width: 100,
    },
  ]

  const statusDatabaseColumns = [
    {
      title: 'LSP ID',
      dataIndex: 'lsp_id',
      key: 'lsp_id',
      width: 200,
      render: (id: string) => <Text code>{id}</Text>,
    },
    {
      title: 'Level',
      dataIndex: 'level',
      key: 'level',
      width: 100,
      render: (level: string) => (
        <Tag color={level === 'level-1' ? 'blue' : 'green'}>
          {level}
        </Tag>
      ),
    },
    {
      title: 'Seq Number',
      dataIndex: 'seq_number',
      key: 'seq_number',
      width: 120,
    },
    {
      title: 'Checksum',
      dataIndex: 'chksum',
      key: 'chksum',
      width: 100,
    },
    {
      title: 'Holdtime',
      dataIndex: 'holdtime',
      key: 'holdtime',
      width: 100,
    },
    {
      title: 'Flags',
      dataIndex: 'flags',
      key: 'flags',
      width: 100,
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>
            <Space>
              <ApiOutlined />
              IS-IS Configuration
            </Space>
          </Title>
          <Text type="secondary">
            Configure Intermediate System to Intermediate System (IS-IS) link-state routing protocol
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
          {config.net ? (
            <Space>
              <Button type="primary" onClick={handleEditConfig}>
                Edit Config
              </Button>
              <Popconfirm
                title="Disable IS-IS"
                description="Are you sure you want to disable IS-IS completely?"
                onConfirm={handleDisableISIS}
                okText="Yes"
                cancelText="No"
              >
                <Button danger>
                  Disable IS-IS
                </Button>
              </Popconfirm>
            </Space>
          ) : (
            <Button type="primary" onClick={handleEditConfig}>
              Setup IS-IS
            </Button>
          )}
        </Space>
      </div>

      {/* IS-IS Summary */}
      <Card bordered={false} style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <div>
              <Text type="secondary">NET</Text>
              <div style={{ fontSize: 20, fontWeight: 'bold', marginTop: 8, color: config.net ? '#1890ff' : '#999' }}>
                {config.net || '-'}
              </div>
            </div>
          </Col>
          <Col span={6}>
            <div>
              <Text type="secondary">Level</Text>
              <div style={{ fontSize: 20, fontWeight: 'bold', marginTop: 8, color: config.level ? '#1890ff' : '#999' }}>
                {config.level || '-'}
              </div>
            </div>
          </Col>
          <Col span={6}>
            <div>
              <Text type="secondary">Metric Style</Text>
              <div style={{ fontSize: 20, fontWeight: 'bold', marginTop: 8, color: config.metric_style ? '#1890ff' : '#999' }}>
                {config.metric_style || '-'}
              </div>
            </div>
          </Col>
          <Col span={6}>
            <div>
              <Text type="secondary">Interfaces</Text>
              <div style={{ fontSize: 20, fontWeight: 'bold', marginTop: 8, color: '#1890ff' }}>
                {config.interfaces.length}
              </div>
            </div>
          </Col>
        </Row>
      </Card>

      {!config.net && (
        <Alert
          message="IS-IS Not Configured"
          description="Click 'Setup IS-IS' to configure IS-IS with your Network Entity Title (NET)."
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Card bordered={false}>
        <Tabs activeKey={activeTab} onChange={handleTabChange}>
          <TabPane tab="Status" key="status">
            <Alert
              message="IS-IS Status"
              description="This shows real-time IS-IS interface status and link-state database (LSP)."
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Title level={4} style={{ marginTop: 0, marginBottom: 16 }}>Interfaces</Title>
            <Table
              dataSource={(isisStatus?.interfaces || []).map((iface, i) => ({ ...iface, key: i }))}
              columns={statusInterfaceColumns}
              rowKey="interface"
              loading={loading}
              pagination={false}
              size="middle"
              locale={{
                emptyText: 'No IS-IS interfaces',
              }}
            />
            <Title level={4} style={{ marginTop: 24, marginBottom: 16 }}>Link-State Database (LSP)</Title>
            <Table
              dataSource={(isisStatus?.database || []).map((lsp, i) => ({ ...lsp, key: i }))}
              columns={statusDatabaseColumns}
              rowKey="lsp_id"
              loading={loading}
              pagination={false}
              size="middle"
              locale={{
                emptyText: 'No LSP entries in database',
              }}
              scroll={{ x: 1000 }}
            />
          </TabPane>
          <TabPane tab="Interfaces" key="interfaces">
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
              {config.net && (
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddInterface}>
                  Add Interface
                </Button>
              )}
            </div>
            <Table
              dataSource={config.interfaces.map((iface, i) => ({ ...iface, key: i }))}
              columns={interfaceColumns}
              rowKey="name"
              loading={loading}
              pagination={false}
              size="middle"
              locale={{
                emptyText: 'No interfaces configured for IS-IS',
              }}
              scroll={{ x: 1000 }}
            />
          </TabPane>
          <TabPane tab="Redistribution" key="redistribute">
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
              {config.net && (
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddRedistribute}>
                  Add Redistribution
                </Button>
              )}
            </div>
            <Table
              dataSource={config.redistribute.map((r, i) => ({ ...r, key: i }))}
              columns={redistributeColumns}
              rowKey={(r) => `${r.source}-${r.level}`}
              loading={loading}
              pagination={false}
              size="middle"
              locale={{
                emptyText: 'No redistribution configured',
              }}
            />
          </TabPane>
        </Tabs>
      </Card>

      {/* Global Config Modal */}
      <Modal
        title={config.net ? 'Edit IS-IS Configuration' : 'Setup IS-IS'}
        open={configModalVisible}
        onOk={handleConfigModalOk}
        onCancel={() => setConfigModalVisible(false)}
        width={700}
        okText="Save"
        cancelText="Cancel"
      >
        <Form form={configForm} layout="vertical">
          <Form.Item
            label="Network Entity Title (NET)"
            name="net"
            rules={[{ required: !config.net, message: 'NET is required for initial setup' }]}
            extra="IS-IS Network Entity Title in CLNS format (e.g., 49.0001.1921.6825.5255.00)"
          >
            <Input placeholder="e.g., 49.0001.1921.6825.5255.00" />
          </Form.Item>

          {!config.net && (
            <>
              <Divider>
                <Text type="secondary">Initial Interface (Required)</Text>
              </Divider>
              <Alert
                message="IS-IS requires at least one interface to be configured"
                description="Please specify the first interface to use for IS-IS."
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
              <Form.Item
                label="Initial Interface"
                name="initial_interface"
                rules={[{ required: true, message: 'Please enter interface name' }]}
              >
                <Input placeholder="e.g., eth1, eth0, lo" />
              </Form.Item>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    label="Circuit Type"
                    name="initial_interface_circuit_type"
                  >
                    <Select placeholder="Select circuit type" allowClear>
                      <Option value="level-1">level-1</Option>
                      <Option value="level-1-2">level-1-2</Option>
                      <Option value="level-2-only">level-2-only</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    label="Metric"
                    name="initial_interface_metric"
                  >
                    <InputNumber min={1} max={16777215} style={{ width: '100%' }} placeholder="1-16777215" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item
                label="Passive Interface"
                name="initial_interface_passive"
                valuePropName="checked"
                extra="Passive interfaces do not send hello packets"
              >
                <Switch />
              </Form.Item>
              <Divider />
            </>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Level"
                name="level"
              >
                <Select placeholder="Select level" allowClear>
                  <Option value="level-1">level-1</Option>
                  <Option value="level-1-2">level-1-2</Option>
                  <Option value="level-2-only">level-2-only</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Metric Style"
                name="metric_style"
              >
                <Select placeholder="Select metric style" allowClear>
                  <Option value="narrow">narrow</Option>
                  <Option value="transition">transition</Option>
                  <Option value="wide">wide</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Divider />
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Purge Originator"
                name="purge_originator"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Set Overload Bit"
                name="set_overload_bit"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            label="SPF Interval (seconds)"
            name="spf_interval"
          >
            <InputNumber min={1} max={60} style={{ width: '100%' }} placeholder="1-60" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Interface Modal */}
      <Modal
        title={interfaceModalMode === 'add' ? 'Add IS-IS Interface' : 'Edit IS-IS Interface'}
        open={interfaceModalVisible}
        onOk={handleInterfaceModalOk}
        onCancel={() => setInterfaceModalVisible(false)}
        width={600}
        okText="Save"
        cancelText="Cancel"
      >
        <Form form={interfaceForm} layout="vertical">
          <Form.Item
            label="Interface"
            name="interface"
            rules={[{ required: true, message: 'Please enter interface name' }]}
            disabled={interfaceModalMode === 'edit'}
          >
            <Input placeholder="e.g., eth1" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Circuit Type"
                name="circuit_type"
              >
                <Select placeholder="Select circuit type" allowClear>
                  <Option value="level-1">level-1</Option>
                  <Option value="level-1-2">level-1-2</Option>
                  <Option value="level-2-only">level-2-only</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Metric"
                name="metric"
              >
                <InputNumber min={1} max={16777215} style={{ width: '100%' }} placeholder="1-16777215" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Hello Interval (seconds)"
                name="hello_interval"
              >
                <InputNumber min={1} max={600} style={{ width: '100%' }} placeholder="1-600" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Hello Multiplier"
                name="hello_multiplier"
              >
                <InputNumber min={2} max={100} style={{ width: '100%' }} placeholder="2-100" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Passive"
                name="passive"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Priority (for DIS election)"
                name="priority"
              >
                <InputNumber min={0} max={127} style={{ width: '100%' }} placeholder="0-127" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Redistribution Modal */}
      <Modal
        title="Add Route Redistribution"
        open={redistributeModalVisible}
        onOk={handleRedistributeModalOk}
        onCancel={() => setRedistributeModalVisible(false)}
        width={500}
        okText="Add"
        cancelText="Cancel"
      >
        <Form form={redistributeForm} layout="vertical">
          <Form.Item
            label="Source"
            name="source"
            rules={[{ required: true, message: 'Please select source' }]}
          >
            <Select placeholder="Select source">
              <Option value="connected">connected</Option>
              <Option value="static">static</Option>
              <Option value="rip">rip</Option>
              <Option value="ospf">ospf</Option>
              <Option value="bgp">bgp</Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="Level"
            name="level"
            rules={[{ required: true, message: 'Please select level' }]}
          >
            <Select placeholder="Select level">
              <Option value="level-1">level-1</Option>
              <Option value="level-1-2">level-1-2</Option>
              <Option value="level-2">level-2</Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="Route Map (optional)"
            name="route_map"
          >
            <Select placeholder="Select route map" allowClear>
              {routeMaps.map(rm => (
                <Option key={rm.name} value={rm.name}>{rm.name}</Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
