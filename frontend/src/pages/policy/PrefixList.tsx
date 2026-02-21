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
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import type { PrefixList as PrefixListType } from '../../api/types'
import { networkApi } from '../../api/network'

const { Title, Text } = Typography
const { Option } = Select

interface PrefixListFormData {
  name: string
}

interface PrefixListRuleFormData {
  sequence: number
  action: string
  prefix: string
  ge?: number
  le?: number
}

export default function PrefixList() {
  const [loading, setLoading] = useState(false)
  const [prefixLists, setPrefixLists] = useState<PrefixListType[]>([])

  // Modals
  const [prefixListModalVisible, setPrefixListModalVisible] = useState(false)
  const [prefixListRuleModalVisible, setPrefixListRuleModalVisible] = useState(false)
  const [selectedPrefixList, setSelectedPrefixList] = useState<string | null>(null)

  const [prefixListForm] = Form.useForm<PrefixListFormData>()
  const [prefixListRuleForm] = Form.useForm<PrefixListRuleFormData>()

  const loadPrefixLists = async () => {
    setLoading(true)
    try {
      const plists = await networkApi.getPrefixLists()
      setPrefixLists(plists)
    } catch (error: any) {
      console.error('Failed to load prefix-lists:', error)
      message.error('Failed to load prefix-lists')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPrefixLists()
  }, [])

  // Prefix Lists
  const handleAddPrefixList = () => {
    prefixListForm.resetFields()
    setPrefixListModalVisible(true)
  }

  const handlePrefixListModalOk = async () => {
    const hide = message.loading('Creating prefix-list...', 0)
    try {
      await prefixListForm.validateFields()
      const values = await prefixListForm.getFieldsValue()

      await networkApi.createPrefixList(values.name)

      hide()
      message.success('Prefix-list created successfully!')
      setPrefixListModalVisible(false)
      loadPrefixLists()
    } catch (error: any) {
      hide()
      console.error('Failed to create prefix-list:', error)
      message.error(`Create failed: ${error.message || 'Unknown error'}`)
    }
  }

  const handleDeletePrefixList = async (name: string) => {
    try {
      await networkApi.deletePrefixList(name)
      message.success('Prefix-list deleted')
      loadPrefixLists()
    } catch (error: any) {
      console.error('Failed to delete prefix-list:', error)
      message.error(error.message || 'Failed to delete prefix-list')
    }
  }

  const handleAddPrefixListRule = (name: string) => {
    setSelectedPrefixList(name)
    prefixListRuleForm.resetFields()
    prefixListRuleForm.setFieldsValue({
      action: 'permit',
      sequence: 10,
    })
    setPrefixListRuleModalVisible(true)
  }

  const handlePrefixListRuleModalOk = async () => {
    const hide = message.loading('Adding prefix-list rule...', 0)
    try {
      if (!selectedPrefixList) return

      await prefixListRuleForm.validateFields()
      const values = await prefixListRuleForm.getFieldsValue()

      await networkApi.addPrefixListRule(selectedPrefixList, {
        sequence: values.sequence,
        action: values.action,
        prefix: values.prefix,
        ge: values.ge,
        le: values.le,
      })

      hide()
      message.success('Prefix-list rule added successfully!')
      setPrefixListRuleModalVisible(false)
      loadPrefixLists()
    } catch (error: any) {
      hide()
      console.error('Failed to add prefix-list rule:', error)
      message.error(`Add failed: ${error.message || 'Unknown error'}`)
    }
  }

  const handleDeletePrefixListRule = async (name: string, sequence: number) => {
    try {
      await networkApi.deletePrefixListRule(name, sequence)
      message.success('Prefix-list rule deleted')
      loadPrefixLists()
    } catch (error: any) {
      console.error('Failed to delete prefix-list rule:', error)
      message.error(error.message || 'Failed to delete prefix-list rule')
    }
  }

  const prefixListColumns = [
    {
      title: 'Rule',
      dataIndex: 'sequence',
      key: 'sequence',
      width: 80,
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 100,
      render: (action: string) => (
        <Tag color={action === 'permit' ? 'green' : 'red'}>
          {action}
        </Tag>
      ),
    },
    {
      title: 'Prefix',
      dataIndex: 'prefix',
      key: 'prefix',
      render: (prefix: string) => <Text code>{prefix}</Text>,
    },
    {
      title: 'GE',
      dataIndex: 'ge',
      key: 'ge',
      width: 80,
      render: (ge?: number) => ge || '-',
    },
    {
      title: 'LE',
      dataIndex: 'le',
      key: 'le',
      width: 80,
      render: (le?: number) => le || '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: any, record: any, __: any, plName: string) => (
        <Popconfirm
          title="Delete Rule"
          description="Are you sure?"
          onConfirm={() => handleDeletePrefixListRule(plName, record.sequence)}
          okText="Yes"
          cancelText="No"
        >
          <Tooltip title="Delete">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Tooltip>
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          <Space>
            <SettingOutlined />
            Prefix Lists
          </Space>
        </Title>
        <Space>
          <Button
            type="default"
            icon={<ReloadOutlined />}
            onClick={loadPrefixLists}
            loading={loading}
          >
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddPrefixList}>
            Create Prefix List
          </Button>
        </Space>
      </div>

      {prefixLists.map((pl) => (
        <Card
          key={pl.name}
          title={<Space><SettingOutlined /> {pl.name}</Space>}
          style={{ marginBottom: 16 }}
          extra={
            <Space>
              <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => handleAddPrefixListRule(pl.name)}>
                Add Rule
              </Button>
              <Popconfirm
                title="Delete Prefix List"
                description="Are you sure?"
                onConfirm={() => handleDeletePrefixList(pl.name)}
                okText="Yes"
                cancelText="No"
              >
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          }
        >
          <Table
            dataSource={pl.rules}
            columns={prefixListColumns.map(col =>
              col.key === 'actions'
                ? { ...col, render: (_: any, record: any) => prefixListColumns.find(c => c.key === 'actions')?.render?.(_, record, {}, pl.name) }
                : col
            )}
            pagination={false}
            size="small"
            rowKey="sequence"
          />
        </Card>
      ))}

      {/* Prefix List Modal */}
      <Modal
        title="Create Prefix List"
        open={prefixListModalVisible}
        onOk={handlePrefixListModalOk}
        onCancel={() => setPrefixListModalVisible(false)}
        width={500}
        okText="Create"
        cancelText="Cancel"
      >
        <Form form={prefixListForm} layout="vertical">
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'Please enter prefix-list name' }]}
          >
            <Input placeholder="e.g., PL-INTERNAL" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Prefix List Rule Modal */}
      <Modal
        title="Add Prefix List Rule"
        open={prefixListRuleModalVisible}
        onOk={handlePrefixListRuleModalOk}
        onCancel={() => setPrefixListRuleModalVisible(false)}
        width={500}
        okText="Add"
        cancelText="Cancel"
      >
        <Form form={prefixListRuleForm} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label="Sequence"
                name="sequence"
                rules={[{ required: true, message: 'Please enter sequence' }]}
              >
                <InputNumber min={1} max={9999} style={{ width: '100%' }} placeholder="10" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="Action"
                name="action"
                rules={[{ required: true, message: 'Please select action' }]}
              >
                <Select>
                  <Option value="permit">Permit</Option>
                  <Option value="deny">Deny</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="Prefix"
                name="prefix"
                rules={[{ required: true, message: 'Please enter prefix' }]}
              >
                <Input placeholder="e.g., 192.168.0.0/16" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="GE (min prefix length)" name="ge" extra="Greater than or equal">
                <InputNumber min={0} max={128} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="LE (max prefix length)" name="le" extra="Less than or equal">
                <InputNumber min={0} max={128} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}
