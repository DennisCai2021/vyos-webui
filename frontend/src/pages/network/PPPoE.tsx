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
  message,
  Popconfirm,
  Tooltip,
  Alert,
  Switch,
  Select,
  Tabs,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  WarningOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import type { PPPoEInterface, PPPoEInterfaceCreate, PPPoEInterfaceUpdate, PPPoEInterfaceStatus, PPPoEStatus, PPPoEConfig, NetworkInterface } from '../../api/types'
import { networkApi } from '../../api'

const { Title, Text } = Typography
const { TabPane } = Tabs

interface PPPoEFormData {
  name: string
  source_interface: string
  username: string
  password: string
  description?: string
  mtu?: number
  default_route: boolean
  name_servers: boolean
}

export default function PPPoE() {
  const [loading, setLoading] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [interfaces, setInterfaces] = useState<PPPoEInterface[]>([])
  const [statuses, setStatuses] = useState<PPPoEInterfaceStatus[]>([])
  const [allInterfaces, setAllInterfaces] = useState<NetworkInterface[]>([])
  const [modalVisible, setModalVisible] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add')
  const [selectedPPPoE, setSelectedPPPoE] = useState<PPPoEInterface | null>(null)
  const [form] = Form.useForm<PPPoEFormData>()
  const [activeTab, setActiveTab] = useState<string>('config')

  const loadPPPoEConfig = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await networkApi.getPPPoEConfig()
      setInterfaces(data.interfaces || [])
    } catch (error: any) {
      console.error('Failed to load PPPoE config:', error)
      const errorMsg = error.message || 'Failed to load PPPoE configuration'
      setError(errorMsg)
      message.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const loadPPPoEStatus = async () => {
    setStatusLoading(true)
    try {
      const data = await networkApi.getPPPoEStatus()
      setStatuses(data.interfaces || [])
    } catch (error: any) {
      console.error('Failed to load PPPoE status:', error)
    } finally {
      setStatusLoading(false)
    }
  }

  const loadAllInterfaces = async () => {
    try {
      const data = await networkApi.getInterfaces()
      setAllInterfaces(data)
    } catch (error: any) {
      console.error('Failed to load interfaces:', error)
    }
  }

  const loadData = async () => {
    await Promise.all([
      loadPPPoEConfig(),
      loadAllInterfaces(),
      loadPPPoEStatus(),
    ])
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (activeTab === 'status') {
      loadPPPoEStatus()
    }
  }, [activeTab])

  const physicalInterfaces = allInterfaces.filter(iface =>
    iface.type === 'ethernet' || iface.name.startsWith('eth') || iface.name.startsWith('enp')
  )

  const handleAdd = () => {
    setModalMode('add')
    setSelectedPPPoE(null)
    form.resetFields()
    form.setFieldsValue({
      name: 'pppoe0',
      source_interface: physicalInterfaces[0]?.name || 'eth0',
      default_route: true,
      name_servers: true,
    })
    setModalVisible(true)
  }

  const handleEdit = (record: PPPoEInterface) => {
    setModalMode('edit')
    setSelectedPPPoE(record)
    form.setFieldsValue({
      name: record.name,
      source_interface: record.source_interface,
      username: record.username,
      password: '',
      description: record.description,
      mtu: record.mtu,
      default_route: record.default_route,
      name_servers: record.name_servers,
    })
    setModalVisible(true)
  }

  const handleModalOk = async () => {
    const hide = message.loading('正在保存PPPoE配置...', 0)
    try {
      await form.validateFields()
      const values = form.getFieldsValue()

      if (modalMode === 'add') {
        await networkApi.createPPPoEInterface({
          name: values.name,
          source_interface: values.source_interface,
          username: values.username,
          password: values.password,
          description: values.description,
          mtu: values.mtu,
          default_route: values.default_route,
          name_servers: values.name_servers,
        })
      } else {
        if (selectedPPPoE) {
          await networkApi.updatePPPoEInterface(selectedPPPoE.name, {
            source_interface: values.source_interface,
            username: values.username,
            password: values.password || undefined,
            description: values.description,
            mtu: values.mtu,
            default_route: values.default_route,
            name_servers: values.name_servers,
          })
        }
      }

      hide()
      message.success(`PPPoE${modalMode === 'add' ? '创建' : '更新'}成功！`)
      setModalVisible(false)
      loadData()
    } catch (error: any) {
      hide()
      console.error('Failed to save PPPoE:', error)
      message.error(`保存失败: ${error.message || `Failed to ${modalMode === 'add' ? 'create' : 'update'} PPPoE`}`)
    }
  }

  const handleDelete = async (record: PPPoEInterface) => {
    const hide = message.loading('正在删除PPPoE...', 0)
    try {
      await networkApi.deletePPPoEInterface(record.name)
      hide()
      message.success(`PPPoE ${record.name} deleted`)
      loadData()
    } catch (error: any) {
      hide()
      message.error(error.message || 'Failed to delete PPPoE')
    }
  }

  const getInterfaceStatus = (name: string) => {
    return statuses.find(s => s.name === name)
  }

  const configColumns = [
    {
      title: 'PPPoE Interface',
      dataIndex: 'name',
      key: 'name',
      width: 140,
      render: (name: string) => (
        <Space>
          <Text strong>{name}</Text>
        </Space>
      ),
    },
    {
      title: 'Source Interface',
      dataIndex: 'source_interface',
      key: 'source_interface',
      width: 140,
      render: (source?: string) => <Text type="secondary">{source || '-'}</Text>,
    },
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
      width: 180,
      render: (username?: string) => <Text>{username || '-'}</Text>,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 180,
      render: (desc?: string) => <Text type="secondary">{desc || '-'}</Text>,
    },
    {
      title: 'Default Route',
      dataIndex: 'default_route',
      key: 'default_route',
      width: 120,
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'green' : 'default'}>
          {enabled ? 'Enabled' : 'Disabled'}
        </Tag>
      ),
    },
    {
      title: 'Name Servers',
      dataIndex: 'name_servers',
      key: 'name_servers',
      width: 120,
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'blue' : 'default'}>
          {enabled ? 'Enabled' : 'Disabled'}
        </Tag>
      ),
    },
    {
      title: 'MTU',
      dataIndex: 'mtu',
      key: 'mtu',
      width: 80,
      render: (mtu?: number) => <Text>{mtu || '-'}</Text>,
    },
    {
      title: 'Status',
      key: 'status',
      width: 100,
      render: (_: any, record: PPPoEInterface) => {
        const status = getInterfaceStatus(record.name)
        const statusColor = status?.status === 'up' ? 'green' : status?.status === 'down' ? 'red' : 'default'
        return (
          <Tag color={statusColor}>
            {(status?.status?.toUpperCase() || 'UNKNOWN')}
          </Tag>
        )
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right' as const,
      width: 150,
      render: (_: any, record: PPPoEInterface) => (
        <Space size="small">
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Popconfirm
            title="Delete PPPoE"
            description="Are you sure you want to delete this PPPoE interface?"
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

  const statusColumns = [
    {
      title: 'PPPoE Interface',
      dataIndex: 'name',
      key: 'name',
      width: 140,
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => {
        const color = status === 'up' ? 'green' : status === 'down' ? 'red' : 'default'
        return <Tag color={color}>{status?.toUpperCase() || 'UNKNOWN'}</Tag>
      },
    },
    {
      title: 'Local IP',
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 150,
      render: (ip?: string) => <Text code>{ip || '-'}</Text>,
    },
    {
      title: 'Remote IP',
      dataIndex: 'remote_ip',
      key: 'remote_ip',
      width: 150,
      render: (ip?: string) => <Text code>{ip || '-'}</Text>,
    },
    {
      title: 'Uptime',
      dataIndex: 'uptime',
      key: 'uptime',
      width: 200,
      render: (uptime?: string) => <Text type="secondary">{uptime || '-'}</Text>,
    },
    {
      title: 'Error',
      dataIndex: 'error',
      key: 'error',
      width: 200,
      render: (error?: string) => error ? <Text type="danger">{error}</Text> : '-',
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>
            PPPoE Interfaces
          </Title>
          <Text type="secondary">Manage PPPoE (Point-to-Point Protocol over Ethernet) connections</Text>
        </div>
        <Space>
          <Button
            type="default"
            icon={<ReloadOutlined />}
            onClick={loadData}
            loading={loading || statusLoading}
          >
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            Add PPPoE
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
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" danger onClick={loadData}>
              Retry
            </Button>
          }
        />
      )}

      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab="Configuration" key="config">
          <Card bordered={false}>
            <Table
              dataSource={interfaces}
              columns={configColumns}
              rowKey="name"
              loading={loading}
              pagination={false}
              scroll={{ x: 1200 }}
              size="middle"
              locale={{
                emptyText: 'No PPPoE interfaces configured',
              }}
            />
          </Card>
        </TabPane>

        <TabPane tab={<span><EyeOutlined /> Status</span>} key="status">
          <Card bordered={false}>
            <Table
              dataSource={statuses}
              columns={statusColumns}
              rowKey="name"
              loading={statusLoading}
              pagination={false}
              scroll={{ x: 1000 }}
              size="middle"
              locale={{
                emptyText: 'No PPPoE status data available',
              }}
            />
          </Card>
        </TabPane>
      </Tabs>

      {/* Add/Edit PPPoE Modal */}
      <Modal
        title={modalMode === 'add' ? 'Add PPPoE Interface' : 'Edit PPPoE Interface'}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => setModalVisible(false)}
        width={600}
        okText="Save"
        cancelText="Cancel"
      >
        <Form form={form} layout="vertical">
          {modalMode === 'add' && (
            <Form.Item
              label="PPPoE Interface Name"
              name="name"
              rules={[{ required: true, message: 'Please enter PPPoE interface name' }]}
              extra="e.g., pppoe0, pppoe1"
            >
              <Input placeholder="pppoe0" />
            </Form.Item>
          )}

          <Form.Item
            label="Source Interface"
            name="source_interface"
            rules={[{ required: true, message: 'Please select source interface' }]}
          >
            <Select placeholder="Select physical interface">
              {physicalInterfaces.map(iface => (
                <Select.Option key={iface.name} value={iface.name}>
                  {iface.name}
                  {iface.description && ` - ${iface.description}`}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="Username"
            name="username"
            rules={[{ required: true, message: 'Please enter PPPoE username' }]}
          >
            <Input placeholder="PPPoE username" />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={modalMode === 'add' ? [{ required: true, message: 'Please enter PPPoE password' }] : []}
            extra={modalMode === 'edit' ? 'Leave empty to keep current password' : ''}
          >
            <Input.Password placeholder="PPPoE password" />
          </Form.Item>

          <Form.Item label="Description" name="description">
            <Input placeholder="PPPoE description" />
          </Form.Item>

          <Form.Item label="MTU" name="mtu">
            <InputNumber min={0} max={65536} style={{ width: '100%' }} placeholder="Leave empty for default (1492)" />
          </Form.Item>

          <Form.Item label="Default Route" name="default_route" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item label="Auto Name Servers" name="name_servers" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
