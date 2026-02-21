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
  Tabs,
  Alert,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  GroupOutlined,
  GlobalOutlined,
  WarningOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import type { Route } from '../../api/types'
import { networkApi } from '../../api'

const { Title, Text } = Typography
const { Option } = Select

interface RouteFormData {
  destination: string
  next_hop?: string
  interface?: string
  distance?: number
  description?: string
}

export default function Routes() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [routes, setRoutes] = useState<Route[]>([])
  const [activeTab, setActiveTab] = useState<'static' | 'connected'>('static')
  const [modalVisible, setModalVisible] = useState(false)
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null)
  const [form] = Form.useForm<RouteFormData>()

  const loadRoutes = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await networkApi.getRoutes()
      setRoutes(data)
    } catch (error: any) {
      console.error('Failed to load routes:', error)
      const errorMsg = error.message || 'Failed to load routes from VyOS device'
      setError(errorMsg)
      message.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRoutes()
  }, [])

  const handleAdd = () => {
    setSelectedRoute(null)
    form.resetFields()
    form.setFieldsValue({ distance: 1 })
    setModalVisible(true)
  }

  const handleEdit = (route: Route) => {
    setSelectedRoute(route)
    form.setFieldsValue({
      destination: route.destination,
      next_hop: route.gateway,
      interface: route.interface,
      distance: route.distance,
    })
    setModalVisible(true)
  }

  const handleModalOk = async () => {
    const hide = message.loading('正在保存路由配置...', 0)
    try {
      await form.validateFields()
      const values = form.getFieldsValue()

      if (selectedRoute) {
        // Update existing route - delete first then add
        await networkApi.deleteRoute(selectedRoute.destination)
      }

      // Add new route
      await networkApi.addRoute({
        destination: values.destination,
        next_hop: values.next_hop,
        interface: values.interface,
        distance: values.distance,
        description: values.description,
      })

      hide()
      message.success('路由保存成功！')
      setModalVisible(false)
      loadRoutes()
    } catch (error: any) {
      hide()
      console.error('Failed to save route:', error)
      message.error(`保存失败: ${error.message || 'Failed to save route'}`)
    }
  }

  const handleDelete = async (route: Route) => {
    const hide = message.loading('正在删除路由...', 0)
    try {
      await networkApi.deleteRoute(route.destination, route.gateway)
      hide()
      message.success('路由删除成功！')
      loadRoutes()
    } catch (error: any) {
      hide()
      console.error('Failed to delete route:', error)
      message.error(`删除失败: ${error.message || 'Failed to delete route'}`)
    }
  }

  const isCIDRValid = (cidr: string) => {
    const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/
    return cidrRegex.test(cidr)
  }

  const validateCIDR = (_: any, value: string) => {
    if (!value) {
      return Promise.reject(new Error('Please enter destination network'))
    }
    if (!isCIDRValid(value)) {
      return Promise.reject(new Error('Invalid CIDR format (e.g., 192.168.1.0/24)'))
    }
    return Promise.resolve()
  }

  const validateIPAddress = (_: any, value: string) => {
    if (!value) {
      return Promise.reject(new Error('Please enter IP address'))
    }
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
    if (!ipRegex.test(value)) {
      return Promise.reject(new Error('Invalid IP address format'))
    }
    const parts = value.split('.')
    if (parts.some((part) => parseInt(part) > 255)) {
      return Promise.reject(new Error('Invalid IP address'))
    }
    return Promise.resolve()
  }

  const columns = [
    {
      title: 'Destination',
      dataIndex: 'destination',
      key: 'destination',
      fixed: 'left' as const,
      width: 180,
      render: (dest: string) => {
        const isDefault = dest === '0.0.0.0/0'
        return (
          <Space>
            {isDefault ? <GlobalOutlined /> : <GroupOutlined />}
            <Text code style={{ color: isDefault ? '#1890ff' : undefined }}>
              {dest}
            </Text>
          </Space>
        )
      },
    },
    {
      title: 'Gateway',
      dataIndex: 'gateway',
      key: 'gateway',
      width: 140,
      render: (gateway?: string) => <Text code>{gateway || '-'}</Text>,
    },
    {
      title: 'Interface',
      dataIndex: 'interface',
      key: 'interface',
      width: 120,
      render: (iface?: string) => <Tag>{iface || '-'}</Tag>,
    },
    {
      title: 'Metric',
      dataIndex: 'metric',
      key: 'metric',
      width: 80,
      render: (metric?: number) => metric || 0,
    },
    {
      title: 'Distance',
      dataIndex: 'distance',
      key: 'distance',
      width: 80,
      render: (dist?: number) => <Tag color="blue">{dist || 0}</Tag>,
    },
    {
      title: 'Type',
      key: 'type',
      width: 100,
      render: (_: any, record: Route) => (
        <Tag color={record.is_static ? 'green' : 'default'}>
          {record.is_static ? 'Static' : 'Connected'}
        </Tag>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 100,
      render: (_: any, record: Route) => (
        <Tag color={record.is_connected ? 'green' : 'orange'}>
          {record.is_connected ? 'Active' : 'Inactive'}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right' as const,
      width: 120,
      render: (_: any, record: Route) => {
        if (!record.is_static) {
          return <Text type="secondary" style={{ fontSize: 12 }}>-</Text>
        }
        return (
          <Space size="small">
            <Tooltip title="Edit">
              <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
            </Tooltip>
            <Popconfirm
              title="Delete Route"
              description="Are you sure you want to delete this route?"
              onConfirm={() => handleDelete(record)}
              okText="Yes"
              cancelText="No"
            >
              <Tooltip title="Delete">
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          </Space>
        )
      },
    },
  ]

  const staticRoutes = routes.filter((r) => r.is_static)
  const connectedRoutes = routes.filter((r) => !r.is_static)

  const tabItems = [
    {
      key: 'static',
      label: `Static Routes (${staticRoutes.length})`,
      children: (
        <Table
          dataSource={staticRoutes}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          scroll={{ x: 1000 }}
          size="middle"
          locale={{
            emptyText: 'No static routes configured',
          }}
        />
      ),
    },
    {
      key: 'connected',
      label: `Connected Routes (${connectedRoutes.length})`,
      children: (
        <Table
          dataSource={connectedRoutes}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          scroll={{ x: 1000 }}
          size="middle"
          locale={{
            emptyText: 'No connected routes',
          }}
        />
      ),
    },
  ]

  return (
    <div>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={2} style={{ margin: 0 }}>
              Routing Table
            </Title>
            <Text type="secondary">
              Manage static and connected routes
            </Text>
          </div>
          <Space>
            <Button
              type="default"
              icon={<ReloadOutlined />}
              onClick={loadRoutes}
              loading={loading}
            >
              Refresh
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              Add Static Route
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
              <Button
                size="small"
                danger
                onClick={loadRoutes}
              >
                Retry
              </Button>
            }
          />
        )}

        <Card bordered={false}>
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
        </Card>

        {/* Add/Edit Route Modal */}
        <Modal
          title={selectedRoute ? 'Edit Route' : 'Add Static Route'}
          open={modalVisible}
          onOk={handleModalOk}
          onCancel={() => setModalVisible(false)}
          width={600}
          okText="Save"
          cancelText="Cancel"
        >
          <Form form={form} layout="vertical">
            <Form.Item
              label="Destination Network"
              name="destination"
              rules={[{ validator: validateCIDR }]}
              extra="e.g., 192.168.2.0/24 or 0.0.0.0/0 for default route"
            >
              <Input placeholder="0.0.0.0/0" />
            </Form.Item>

            <Form.Item
              label="Next Hop (Gateway)"
              name="next_hop"
              rules={[{ validator: (_: any, value: string) => {
                if (!value) {
                  return Promise.resolve()
                }
                return validateIPAddress(_, value)
              }}]}
              extra="Leave empty if using a directly connected network"
            >
              <Input placeholder="e.g., 192.168.1.254" />
            </Form.Item>

            <Form.Item
              label="Interface"
              name="interface"
              dependencies={['next_hop']}
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value && !getFieldValue('next_hop')) {
                      return Promise.reject(new Error('Please provide either Next Hop or Interface'))
                    }
                    return Promise.resolve()
                  },
                }),
              ]}
            >
              <Select placeholder="Select interface">
                <Option value="eth0">eth0</Option>
                <Option value="eth1">eth1</Option>
                <Option value="eth2">eth2</Option>
              </Select>
            </Form.Item>

            <Form.Item
              label="Administrative Distance"
              name="distance"
              extra="Lower value = higher priority (1 = static route)"
            >
              <InputNumber min={1} max={255} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item label="Description" name="description">
              <Input placeholder="Optional route description" />
            </Form.Item>

            <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: 4, marginTop: 16 }}>
              <Text type="secondary">
                <EyeOutlined /> Note: Routes with destination 0.0.0.0/0 are default routes.
                Only one default route per interface should be active.
              </Text>
            </div>
          </Form>
        </Modal>
      </Space>
    </div>
  )
}
