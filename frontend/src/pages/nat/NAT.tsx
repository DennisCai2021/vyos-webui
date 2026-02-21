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
  Select,
  Switch,
  Tabs,
  Divider,
  message,
  Popconfirm,
  Tooltip,
  Row,
  Col,
  Alert,
  InputNumber,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import type { NATRule } from '../../api/types'
import { firewallApi } from '../../api'
import apiClient from '../../api/client'

const { Title, Text } = Typography
const { Option } = Select
const { TabPane } = Tabs

interface NATRuleFormData {
  name?: string
  type: 'source' | 'destination' | 'masquerade'
  sequence: number
  description?: string
  source_address?: string
  source_port?: string
  destination_address?: string
  destination_port?: string
  inbound_interface?: string
  outbound_interface?: string
  translation_address?: string
  translation_port?: string
  protocol?: string
  enabled: boolean
  log?: boolean
}

export default function NAT() {
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('all')
  const [rules, setRules] = useState<NATRule[]>([])
  const [selectedRule, setSelectedRule] = useState<NATRule | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add')
  const [form] = Form.useForm<NATRuleFormData>()

  const loadRules = async () => {
    setLoading(true)
    try {
      const data = await firewallApi.getNATRules()
      setRules(data.sort((a, b) => a.sequence - b.sequence))
    } catch (error: any) {
      console.error('Failed to load NAT rules:', error)
      message.error('Failed to load NAT rules')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRules()
  }, [])

  const filteredRules = rules.filter(rule => {
    if (activeTab === 'all') return true
    return rule.type === activeTab
  })

  const handleAdd = () => {
    setModalMode('add')
    setSelectedRule(null)
    form.resetFields()
    form.setFieldsValue({
      type: activeTab === 'all' ? 'source' : activeTab,
      sequence: 10,
      enabled: true,
      log: false,
    })
    setModalVisible(true)
  }

  const handleEdit = (record: NATRule) => {
    setModalMode('edit')
    setSelectedRule(record)
    form.setFieldsValue({
      name: record.name,
      type: record.type,
      sequence: record.sequence,
      description: record.description,
      source_address: record.source_address,
      source_port: record.source_port,
      destination_address: record.destination_address,
      destination_port: record.destination_port,
      inbound_interface: record.inbound_interface,
      outbound_interface: record.outbound_interface,
      translation_address: record.translation_address,
      translation_port: record.translation_port,
      protocol: record.protocol,
      enabled: record.enabled,
      log: record.log,
    })
    setModalVisible(true)
  }

  const handleDelete = async (record: NATRule) => {
    try {
      await apiClient.delete(`/firewall/nat/rules/${record.name || record.id}`, {
        params: {
          nat_type: record.type,
          sequence: record.sequence,
        }
      })
      message.success('NAT rule deleted')
      loadRules()
    } catch (error: any) {
      console.error('Failed to delete NAT rule:', error)
      message.error(error.message || 'Failed to delete NAT rule')
    }
  }

  const handleModalOk = async () => {
    const hide = message.loading('Saving NAT rule...', 0)
    try {
      await form.validateFields()
      const values = await form.getFieldsValue()

      // Send data in backend format
      await apiClient.post('/firewall/nat/rules', {
        name: values.name || `nat-rule-${values.sequence}`,
        type: values.type,
        sequence: values.sequence,
        description: values.description,
        enabled: values.enabled,
        source_address: values.source_address,
        source_port: values.source_port,
        destination_address: values.destination_address,
        destination_port: values.destination_port,
        inbound_interface: values.inbound_interface,
        outbound_interface: values.outbound_interface,
        translation_address: values.translation_address,
        translation_port: values.translation_port,
        protocol: values.protocol,
        log: values.log || false,
      })

      hide()
      message.success(`NAT rule ${modalMode === 'add' ? 'created' : 'updated'} successfully!`)
      setModalVisible(false)
      loadRules()
    } catch (error: any) {
      hide()
      console.error('Failed to save NAT rule:', error)
      message.error(`Save failed: ${error.message || 'Unknown error'}`)
    }
  }

  const columns = [
    {
      title: 'Sequence',
      dataIndex: 'sequence',
      key: 'sequence',
      width: 90,
      render: (seq: number) => <Text strong>{seq}</Text>,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 130,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 110,
      render: (type: string) => {
        const colors: Record<string, string> = {
          source: 'blue',
          destination: 'purple',
          masquerade: 'orange',
        }
        return <Tag color={colors[type] || 'default'}>{type.toUpperCase()}</Tag>
      },
    },
    {
      title: 'Source',
      key: 'source',
      width: 140,
      render: (_: any, record: NATRule) => (
        <div>
          {record.source_address && <Text code>{record.source_address}</Text>}
          {record.source_port && <Text type="secondary">:{record.source_port}</Text>}
          {!record.source_address && !record.source_port && '-'}
        </div>
      ),
    },
    {
      title: 'Destination',
      key: 'destination',
      width: 140,
      render: (_: any, record: NATRule) => (
        <div>
          {record.destination_address && <Text code>{record.destination_address}</Text>}
          {record.destination_port && <Text type="secondary">:{record.destination_port}</Text>}
          {!record.destination_address && !record.destination_port && '-'}
        </div>
      ),
    },
    {
      title: 'Interface',
      key: 'interface',
      width: 120,
      render: (_: any, record: NATRule) => {
        if (record.type === 'destination') {
          return record.inbound_interface ? <Text type="secondary">in: {record.inbound_interface}</Text> : '-'
        }
        return record.outbound_interface ? <Text type="secondary">out: {record.outbound_interface}</Text> : '-'
      },
    },
    {
      title: 'Translation',
      key: 'translation',
      width: 140,
      render: (_: any, record: NATRule) => (
        <div>
          {record.type === 'masquerade' ? (
            <Tag color="orange">masquerade</Tag>
          ) : (
            <>
              {record.translation_address && <Text code>{record.translation_address}</Text>}
              {record.translation_port && <Text type="secondary">:{record.translation_port}</Text>}
              {!record.translation_address && !record.translation_port && '-'}
            </>
          )}
        </div>
      ),
    },
    {
      title: 'Protocol',
      dataIndex: 'protocol',
      key: 'protocol',
      width: 90,
      render: (proto?: string) => proto ? <Tag>{proto}</Tag> : '-',
    },
    {
      title: 'Status',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'green' : 'default'}>
          {enabled ? 'Enabled' : 'Disabled'}
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
      title: 'Actions',
      key: 'actions',
      fixed: 'right' as const,
      width: 120,
      render: (_: any, record: NATRule) => (
        <Space size="small">
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Popconfirm
            title="Delete NAT Rule"
            description="Are you sure you want to delete this NAT rule?"
            onConfirm={() => handleDelete(record)}
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>
            <Space>
              <SwapOutlined />
              NAT Configuration
            </Space>
          </Title>
          <Text type="secondary">
            Manage Network Address Translation (NAT) - Source NAT, Destination NAT, and Masquerade
          </Text>
        </div>
        <Space>
          <Button
            type="default"
            icon={<ReloadOutlined />}
            onClick={loadRules}
            loading={loading}
          >
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            Add NAT Rule
          </Button>
        </Space>
      </div>

      <Card bordered={false}>
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane tab="All Rules" key="all" />
          <TabPane tab="Source NAT" key="source" />
          <TabPane tab="Destination NAT" key="destination" />
          <TabPane tab="Masquerade" key="masquerade" />
        </Tabs>

        <Divider style={{ marginTop: 8, marginBottom: 16 }} />

        <Table
          dataSource={filteredRules}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          scroll={{ x: 1600 }}
          size="middle"
          locale={{
            emptyText: 'No NAT rules configured',
          }}
        />
      </Card>

      <Modal
        title={modalMode === 'add' ? 'Add NAT Rule' : 'Edit NAT Rule'}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => setModalVisible(false)}
        width={700}
        okText="Save"
        cancelText="Cancel"
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Rule Name"
                name="name"
                extra="Optional, will be auto-generated if left empty"
              >
                <Input placeholder="e.g., nat-rule-10" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Sequence"
                name="sequence"
                rules={[{ required: true, message: 'Please enter sequence number' }]}
              >
                <InputNumber min={1} max={9999} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="NAT Type"
            name="type"
            rules={[{ required: true, message: 'Please select NAT type' }]}
          >
            <Select placeholder="Select NAT type">
              <Option value="source">Source NAT (SNAT)</Option>
              <Option value="destination">Destination NAT (DNAT / Port Forwarding)</Option>
              <Option value="masquerade">Masquerade</Option>
            </Select>
          </Form.Item>

          <Form.Item label="Description" name="description">
            <Input placeholder="Rule description" />
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.type !== curr.type}>
            {({ getFieldValue }) => {
              const natType = getFieldValue('type')
              return (
                <>
                  <Divider orientation="left">Matching Criteria</Divider>

                  {natType === 'destination' && (
                    <Form.Item label="Inbound Interface" name="inbound_interface">
                      <Input placeholder="e.g., eth0 (required for DNAT)" />
                    </Form.Item>
                  )}

                  {natType !== 'destination' && (
                    <Form.Item label="Outbound Interface" name="outbound_interface">
                      <Input placeholder="e.g., eth0" />
                    </Form.Item>
                  )}

                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item label="Source Address" name="source_address">
                        <Input placeholder="e.g., 192.168.1.0/24" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="Source Port" name="source_port">
                        <Input placeholder="e.g., 1024 or 10000-20000" />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item label="Destination Address" name="destination_address">
                        <Input placeholder="e.g., 203.0.113.10" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="Destination Port" name="destination_port">
                        <Input placeholder="e.g., 80 or 10000-20000" />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item label="Protocol" name="protocol">
                    <Select placeholder="Select protocol (optional)">
                      <Option value="tcp">TCP</Option>
                      <Option value="udp">UDP</Option>
                      <Option value="icmp">ICMP</Option>
                      <Option value="tcp_udp">TCP+UDP</Option>
                      <Option value="all">All</Option>
                    </Select>
                  </Form.Item>

                  {natType !== 'masquerade' && (
                    <>
                      <Divider orientation="left">Translation</Divider>
                      <Row gutter={16}>
                        <Col span={12}>
                          <Form.Item label="Translation Address" name="translation_address">
                            <Input placeholder="e.g., 203.0.113.10" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item label="Translation Port" name="translation_port">
                            <Input placeholder="e.g., 8080 or 10000-20000" />
                          </Form.Item>
                        </Col>
                      </Row>
                    </>
                  )}
                </>
              )
            }}
          </Form.Item>

          <Divider style={{ marginBottom: 12 }} />

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Enabled" name="enabled" valuePropName="checked" initialValue={true}>
                <Switch />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Log" name="log" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}
