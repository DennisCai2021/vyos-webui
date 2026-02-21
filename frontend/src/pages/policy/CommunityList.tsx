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
  Row,
  Col,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SafetyOutlined,
} from '@ant-design/icons'
import type { CommunityList as CommunityListType, CommunityListRule } from '../../api/types'
import { networkApi } from '../../api/network'

const { Title, Text } = Typography
const { Option } = Select

interface CommunityListFormData {
  name: string
  type: 'standard' | 'expanded'
}

interface RuleFormData {
  sequence: number
  action: 'permit' | 'deny'
  community: string
  description?: string
}

export default function CommunityList() {
  const [loading, setLoading] = useState(false)
  const [communityLists, setCommunityLists] = useState<CommunityListType[]>([])

  // Modals
  const [listModalVisible, setListModalVisible] = useState(false)
  const [ruleModalVisible, setRuleModalVisible] = useState(false)
  const [currentList, setCurrentList] = useState<string | null>(null)

  const [listForm] = Form.useForm<CommunityListFormData>()
  const [ruleForm] = Form.useForm<RuleFormData>()

  const loadData = async () => {
    setLoading(true)
    try {
      const lists = await networkApi.getCommunityLists()
      setCommunityLists(lists)
    } catch (error: any) {
      console.error('Failed to load community lists:', error)
      message.error('Failed to load community lists')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Community Lists
  const handleAddList = () => {
    listForm.resetFields()
    listForm.setFieldsValue({ type: 'standard' })
    setListModalVisible(true)
  }

  const handleListModalOk = async () => {
    const hide = message.loading('Creating community list...', 0)
    try {
      await listForm.validateFields()
      const values = await listForm.getFieldsValue()

      await networkApi.createCommunityList(values.name, values.type)

      hide()
      message.success('Community list created successfully!')
      setListModalVisible(false)
      loadData()
    } catch (error: any) {
      hide()
      console.error('Failed to create community list:', error)
      message.error(`Create failed: ${error.message || 'Unknown error'}`)
    }
  }

  const handleDeleteList = async (name: string) => {
    try {
      await networkApi.deleteCommunityList(name)
      message.success('Community list deleted')
      loadData()
    } catch (error: any) {
      console.error('Failed to delete community list:', error)
      message.error(error.message || 'Failed to delete community list')
    }
  }

  // Rules
  const handleAddRule = (listName: string) => {
    setCurrentList(listName)
    ruleForm.resetFields()
    ruleForm.setFieldsValue({ action: 'permit' })
    setRuleModalVisible(true)
  }

  const handleRuleModalOk = async () => {
    if (!currentList) return

    const hide = message.loading('Adding rule...', 0)
    try {
      await ruleForm.validateFields()
      const values = await ruleForm.getFieldsValue()

      await networkApi.addCommunityListRule(currentList, {
        sequence: values.sequence,
        action: values.action,
        community: values.community,
        description: values.description,
      })

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

  const handleDeleteRule = async (listName: string, sequence: number) => {
    try {
      await networkApi.deleteCommunityListRule(listName, sequence)
      message.success('Rule deleted')
      loadData()
    } catch (error: any) {
      console.error('Failed to delete rule:', error)
      message.error(error.message || 'Failed to delete rule')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          <Space>
            <SafetyOutlined />
            Community Lists
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
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddList}>
            Create Community List
          </Button>
        </Space>
      </div>

      {communityLists.map((cl) => {
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
            title: 'Community',
            dataIndex: 'community',
            key: 'community',
            render: (community: string) => <Text code>{community}</Text>,
          },
          {
            title: 'Description',
            dataIndex: 'description',
            key: 'description',
            render: (d: string) => d || '-',
          },
          {
            title: 'Actions',
            key: 'actions',
            width: 100,
            render: (_: any, record: CommunityListRule) => (
              <Popconfirm
                title="Delete Rule"
                description="Are you sure?"
                onConfirm={() => handleDeleteRule(cl.name, record.sequence)}
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
            key={cl.name}
            title={
              <Space>
                <SafetyOutlined />
                {cl.name}
                <Tag color="blue">{cl.type}</Tag>
              </Space>
            }
            style={{ marginBottom: 16 }}
            extra={
              <Space>
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => handleAddRule(cl.name)}>
                  Add Rule
                </Button>
                <Popconfirm
                  title="Delete Community List"
                  description="Are you sure?"
                  onConfirm={() => handleDeleteList(cl.name)}
                  okText="Yes"
                  cancelText="No"
                >
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            }
          >
            <Table
              dataSource={cl.rules}
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

      {/* Community List Modal */}
      <Modal
        title="Create Community List"
        open={listModalVisible}
        onOk={handleListModalOk}
        onCancel={() => setListModalVisible(false)}
        width={500}
        okText="Create"
        cancelText="Cancel"
      >
        <Form form={listForm} layout="vertical">
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'Please enter community list name' }]}
          >
            <Input placeholder="e.g., CL-EXPORT" />
          </Form.Item>
          <Form.Item
            label="Type"
            name="type"
            rules={[{ required: true, message: 'Please select type' }]}
          >
            <Select>
              <Option value="standard">standard</Option>
              <Option value="expanded">expanded</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Rule Modal */}
      <Modal
        title="Add Rule"
        open={ruleModalVisible}
        onOk={handleRuleModalOk}
        onCancel={() => setRuleModalVisible(false)}
        width={500}
        okText="Save"
        cancelText="Cancel"
      >
        <Form form={ruleForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Sequence"
                name="sequence"
                rules={[{ required: true, message: 'Please enter sequence number' }]}
              >
                <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="10" />
              </Form.Item>
            </Col>
            <Col span={12}>
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
          </Row>
          <Form.Item
            label="Community"
            name="community"
            rules={[{ required: true, message: 'Please enter community value' }]}
          >
            <Input placeholder="e.g., 65001:100 or no-export or internet" />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input placeholder="Rule description (optional)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
