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
  SafetyOutlined,
} from '@ant-design/icons'
import type { FirewallRule } from '../../api/types'
import { firewallApi } from '../../api'
import apiClient from '../../api/client'

const { Title, Text } = Typography
const { Option } = Select

interface FirewallRuleFormData {
  name?: string
  direction: 'in' | 'out' | 'forward'
  action: 'accept' | 'drop' | 'reject'
  source_address?: string
  source_port?: string
  destination_address?: string
  destination_port?: string
  protocol: 'tcp' | 'udp' | 'icmp' | 'any'
  enabled: boolean
  log?: boolean
  description?: string
  sequence: number
}

export default function Firewall() {
  const [loading, setLoading] = useState(false)
  const [rules, setRules] = useState<FirewallRule[]>([])
  const [selectedRule, setSelectedRule] = useState<FirewallRule | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add')
  const [form] = Form.useForm<FirewallRuleFormData>()

  const loadRules = async () => {
    setLoading(true)
    try {
      const data = await firewallApi.getRules()
      setRules(data.sort((a, b) => a.order - b.order))
    } catch (error: any) {
      console.error('Failed to load firewall rules:', error)
      message.error('Failed to load firewall rules')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRules()
  }, [])

  const handleAdd = () => {
    setModalMode('add')
    setSelectedRule(null)
    form.resetFields()
    form.setFieldsValue({
      direction: 'in',
      action: 'accept',
      protocol: 'any',
      enabled: true,
      log: false,
      sequence: 10,
    })
    setModalVisible(true)
  }

  const handleEdit = (record: FirewallRule) => {
    setModalMode('edit')
    setSelectedRule(record)
    form.setFieldsValue({
      name: record.name,
      direction: 'in',
      action: record.action,
      source_address: record.source,
      source_port: record.source_port,
      destination_address: record.destination,
      destination_port: record.destination_port,
      protocol: record.protocol,
      enabled: record.enabled,
      log: record.log,
      description: record.description || record.comment,
      sequence: record.order || 10,
    })
    setModalVisible(true)
  }

  const handleDelete = async (record: FirewallRule) => {
    try {
      // Use name and sequence from record for deletion
      await apiClient.delete(`/firewall/rules/${record.name || record.id}`, {
        params: {
          direction: 'in',
          sequence: record.order,
        }
      })
      message.success('Firewall rule deleted')
      loadRules()
    } catch (error: any) {
      console.error('Failed to delete firewall rule:', error)
      message.error(error.message || 'Failed to delete firewall rule')
    }
  }

  const handleModalOk = async () => {
    const hide = message.loading('Saving firewall rule...', 0)
    try {
      await form.validateFields()
      const values = await form.getFieldsValue()

      if (modalMode === 'add') {
        // Send data in backend format
        await apiClient.post('/firewall/rules', {
          name: values.name || `rule-${values.sequence}`,
          direction: values.direction,
          action: values.action,
          sequence: values.sequence,
          description: values.description,
          enabled: values.enabled,
          source_address: values.source_address,
          destination_address: values.destination_address,
          source_port: values.source_port ? parseInt(values.source_port) : undefined,
          destination_port: values.destination_port ? parseInt(values.destination_port) : undefined,
          protocol: values.protocol === 'any' ? undefined : values.protocol,
          log: values.log || false,
        })
      } else if (selectedRule) {
        // For update, we'll use name and direction from the original record
        await apiClient.put(`/firewall/rules/${selectedRule.name || selectedRule.id}`, {
          name: values.name || selectedRule.name,
          direction: values.direction,
          action: values.action,
          sequence: values.sequence,
          description: values.description,
          enabled: values.enabled,
          source_address: values.source_address,
          destination_address: values.destination_address,
          source_port: values.source_port ? parseInt(values.source_port) : undefined,
          destination_port: values.destination_port ? parseInt(values.destination_port) : undefined,
          protocol: values.protocol === 'any' ? undefined : values.protocol,
          log: values.log || false,
        })
      }

      hide()
      message.success(`Firewall rule ${modalMode === 'add' ? 'created' : 'updated'} successfully!`)
      setModalVisible(false)
      loadRules()
    } catch (error: any) {
      hide()
      console.error('Failed to save firewall rule:', error)
      message.error(`Save failed: ${error.message || 'Unknown error'}`)
    }
  }

  const columns = [
    {
      title: 'Sequence',
      dataIndex: 'order',
      key: 'order',
      width: 100,
      render: (seq: number) => <Text strong>{seq}</Text>,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 100,
      render: (action: string) => {
        const colors: Record<string, string> = {
          accept: 'green',
          drop: 'red',
          reject: 'orange',
        }
        return <Tag color={colors[action] || 'default'}>{action.toUpperCase()}</Tag>
      },
    },
    {
      title: 'Protocol',
      dataIndex: 'protocol',
      key: 'protocol',
      width: 100,
      render: (proto: string) => <Tag>{proto ? proto.toUpperCase() : 'ANY'}</Tag>,
    },
    {
      title: 'Source',
      dataIndex: 'source',
      key: 'source',
      width: 150,
      render: (src?: string) => src && src !== 'any' ? <Text code>{src}</Text> : '-',
    },
    {
      title: 'Destination',
      dataIndex: 'destination',
      key: 'destination',
      width: 150,
      render: (dst?: string) => dst && dst !== 'any' ? <Text code>{dst}</Text> : '-',
    },
    {
      title: 'Status',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'green' : 'default'}>
          {enabled ? 'Enabled' : 'Disabled'}
        </Tag>
      ),
    },
    {
      title: 'Description',
      dataIndex: ['description', 'comment'],
      key: 'description',
      render: (_: any, record: any) => {
        const desc = record.description || record.comment
        return desc ? <Text type="secondary">{desc}</Text> : '-'
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right' as const,
      width: 120,
      render: (_: any, record: FirewallRule) => (
        <Space size="small">
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Popconfirm
            title="Delete Rule"
            description="Are you sure you want to delete this firewall rule?"
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
              <SafetyOutlined />
              Firewall Configuration
            </Space>
          </Title>
          <Text type="secondary">
            Manage IPv4/IPv6 firewall rules, groups, and zone-based policies
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
            Add Rule
          </Button>
        </Space>
      </div>

      <Alert
        message="VyOS Firewall"
        description="VyOS firewall supports IPv4/IPv6 filtering, zone-based policies, and bridge firewall."
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Card bordered={false}>
        <Table
          dataSource={rules}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          scroll={{ x: 1200 }}
          size="middle"
          locale={{
            emptyText: 'No firewall rules configured',
          }}
        />
      </Card>

      <Modal
        title={modalMode === 'add' ? 'Add Firewall Rule' : 'Edit Firewall Rule'}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => setModalVisible(false)}
        width={600}
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
                <Input placeholder="e.g., allow-ssh" />
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

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Direction"
                name="direction"
                rules={[{ required: true, message: 'Please select direction' }]}
              >
                <Select placeholder="Select direction">
                  <Option value="in">Inbound (in)</Option>
                  <Option value="out">Outbound (out)</Option>
                  <Option value="forward">Forward</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Action"
                name="action"
                rules={[{ required: true, message: 'Please select action' }]}
              >
                <Select placeholder="Select action">
                  <Option value="accept">Accept (allow traffic)</Option>
                  <Option value="drop">Drop (silently discard)</Option>
                  <Option value="reject">Reject (send ICMP unreachable)</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Description" name="description">
            <Input placeholder="Rule description" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Source Address" name="source_address">
                <Input placeholder="e.g., 192.168.1.0/24" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Source Port" name="source_port">
                <Input placeholder="e.g., 22 or 1000-2000" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Destination Address" name="destination_address">
                <Input placeholder="e.g., 203.0.113.0/24" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Destination Port" name="destination_port">
                <Input placeholder="e.g., 80 or 8080" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="Protocol"
            name="protocol"
            rules={[{ required: true, message: 'Please select protocol' }]}
          >
            <Select placeholder="Select protocol">
              <Option value="any">Any</Option>
              <Option value="tcp">TCP</Option>
              <Option value="udp">UDP</Option>
              <Option value="icmp">ICMP</Option>
            </Select>
          </Form.Item>

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
