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
  Row,
  Col,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import type { NetworkInterface, VLANInterface, VLANInterfaceUpdate } from '../../api/types'
import { networkApi } from '../../api'

const { Title, Text } = Typography

interface VLANFormData {
  name: string
  parent_interface: string
  vlan_id: number
  description?: string
  mtu?: number
  ip_addresses?: Array<{ address: string; cidr: number }>
}

export default function VLAN() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([])
  const [modalVisible, setModalVisible] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add')
  const [selectedVLAN, setSelectedVLAN] = useState<NetworkInterface | null>(null)
  const [form] = Form.useForm<VLANFormData>()

  const loadInterfaces = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await networkApi.getInterfaces()
      setInterfaces(data)
    } catch (error: any) {
      console.error('Failed to load interfaces:', error)
      const errorMsg = error.message || 'Failed to load interfaces from VyOS device'
      setError(errorMsg)
      message.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInterfaces()
  }, [])

  const vlanInterfaces = interfaces.filter(iface =>
    iface.type === 'vlan' || (iface.name && iface.name.includes('.'))
  )

  const handleAdd = () => {
    setModalMode('add')
    setSelectedVLAN(null)
    form.resetFields()
    form.setFieldsValue({
      parent_interface: 'eth0',
      vlan_id: 100,
      ip_addresses: [],
      mtu: 1500,
    })
    setModalVisible(true)
  }

  const handleEdit = (record: NetworkInterface) => {
    setModalMode('edit')
    setSelectedVLAN(record)

    // Try to parse parent and vlan_id from name (eth0.100 -> eth0, 100)
    let parent_interface = 'eth0'
    let vlan_id = 100

    if (record.name && record.name.includes('.')) {
      const parts = record.name.split('.')
      parent_interface = parts[0]
      vlan_id = parseInt(parts[1]) || 100
    }

    // Convert ip_addresses to form format
    const ipAddresses = record.ip_addresses?.map(ip => ({
      address: ip.address,
      cidr: ip.cidr
    })) || []

    form.setFieldsValue({
      name: record.name,
      parent_interface: record.parent_interface || parent_interface,
      vlan_id: record.vlan_id || vlan_id,
      description: record.description,
      mtu: record.mtu,
      ip_addresses: ipAddresses,
    })
    setModalVisible(true)
  }

  const handleModalOk = async () => {
    const hide = message.loading('正在保存VLAN配置...', 0)
    try {
      await form.validateFields()
      const values = form.getFieldsValue()

      if (modalMode === 'add') {
        // Create VLAN name if not provided
        const vlanName = values.name || `${values.parent_interface}.${values.vlan_id}`

        // Create VLAN interface
        await networkApi.createVLANInterface({
          name: vlanName,
          parent_interface: values.parent_interface,
          vlan_id: values.vlan_id,
          description: values.description,
          mtu: values.mtu,
        })

        // Add IP addresses if provided
        if (values.ip_addresses && values.ip_addresses.length > 0) {
          for (const ip of values.ip_addresses) {
            await networkApi.addIPToVLAN(vlanName, `${ip.address}/${ip.cidr}`)
          }
        }
      } else {
        // Update existing VLAN
        if (selectedVLAN) {
          await networkApi.updateVLANInterface(selectedVLAN.name, {
            description: values.description,
            mtu: values.mtu,
          })

          // Handle IP address updates
          if (values.ip_addresses) {
            const currentIps = selectedVLAN.ip_addresses || []
            const newIps = values.ip_addresses

            // Create sets for comparison
            const currentIpSet = new Set(currentIps.map(ip => `${ip.address}/${ip.cidr}`))
            const newIpSet = new Set(newIps.map(ip => `${ip.address}/${ip.cidr}`))

            // Add new IPs
            for (const ip of newIps) {
              const ipStr = `${ip.address}/${ip.cidr}`
              if (!currentIpSet.has(ipStr)) {
                try {
                  await networkApi.addIPToVLAN(selectedVLAN.name, ipStr)
                } catch (e: any) {
                  console.warn('Failed to add IP:', e)
                }
              }
            }

            // Remove old IPs
            for (const ip of currentIps) {
              const ipStr = `${ip.address}/${ip.cidr}`
              if (!newIpSet.has(ipStr)) {
                try {
                  await networkApi.removeIPFromVLAN(selectedVLAN.name, ipStr)
                } catch (e: any) {
                  console.warn('Failed to remove IP:', e)
                }
              }
            }
          }
        }
      }

      hide()
      message.success(`VLAN${modalMode === 'add' ? '创建' : '更新'}成功！`)
      setModalVisible(false)
      loadInterfaces()
    } catch (error: any) {
      hide()
      console.error('Failed to save VLAN:', error)
      message.error(`保存失败: ${error.message || `Failed to ${modalMode === 'add' ? 'create' : 'update'} VLAN`}`)
    }
  }

  const handleDelete = async (record: NetworkInterface) => {
    const hide = message.loading('正在删除VLAN...', 0)
    try {
      await networkApi.deleteVLANInterface(record.name)
      hide()
      message.success(`VLAN ${record.name} deleted`)
      loadInterfaces()
    } catch (error: any) {
      hide()
      message.error(error.message || 'Failed to delete VLAN')
    }
  }

  const handleRemoveIP = async (record: NetworkInterface, address: string) => {
    try {
      await networkApi.removeIPFromVLAN(record.name, address)
      message.success('IP address removed')
      loadInterfaces()
    } catch (error: any) {
      message.error(error.message || 'Failed to remove IP')
    }
  }

  const columns = [
    {
      title: 'VLAN Interface',
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
      title: 'Parent Interface',
      dataIndex: 'parent_interface',
      key: 'parent_interface',
      width: 140,
      render: (parent?: string, record: NetworkInterface) => {
        if (parent) return parent
        // Try to parse from name
        if (record.name && record.name.includes('.')) {
          return record.name.split('.')[0]
        }
        return '-'
      },
    },
    {
      title: 'VLAN ID',
      dataIndex: 'vlan_id',
      key: 'vlan_id',
      width: 100,
      render: (vlanId?: number, record: NetworkInterface) => {
        if (vlanId) return vlanId
        // Try to parse from name
        if (record.name && record.name.includes('.')) {
          const parts = record.name.split('.')
          return parts[1]
        }
        return '-'
      },
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 180,
      render: (desc?: string) => <Text type="secondary">{desc || '-'}</Text>,
    },
    {
      title: 'IP Addresses',
      dataIndex: 'ip_addresses',
      key: 'ip_addresses',
      width: 200,
      render: (_: any, record: NetworkInterface) => {
        if (!record.ip_addresses || record.ip_addresses.length === 0) {
          return <Text type="secondary">N/A</Text>
        }
        return (
          <div>
            {record.ip_addresses.map((ip, idx) => (
              <div key={idx} style={{ marginBottom: 4 }}>
                <Space>
                  <Tag>
                    <Text code>{ip.address}/{ip.cidr}</Text>
                  </Tag>
                  <Popconfirm
                    title="Remove IP"
                    description="Are you sure you want to remove this IP address?"
                    onConfirm={() => handleRemoveIP(record, `${ip.address}/${ip.cidr}`)}
                    okText="Yes"
                    cancelText="No"
                  >
                    <Button type="text" size="small" danger style={{ padding: 0 }}>
                      <DeleteOutlined />
                    </Button>
                  </Popconfirm>
                </Space>
              </div>
            ))}
          </div>
        )
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={status === 'up' ? 'green' : 'red'}>
          {status?.toUpperCase() || 'UNKNOWN'}
        </Tag>
      ),
    },
    {
      title: 'MTU',
      dataIndex: 'mtu',
      key: 'mtu',
      width: 80,
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right' as const,
      width: 150,
      render: (_: any, record: NetworkInterface) => (
        <Space size="small">
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          <Popconfirm
            title="Delete VLAN"
            description="Are you sure you want to delete this VLAN interface?"
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
            VLAN Interfaces
          </Title>
          <Text type="secondary">Manage VLAN interfaces and IP configuration</Text>
        </div>
        <Space>
          <Button
            type="default"
            icon={<ReloadOutlined />}
            onClick={loadInterfaces}
            loading={loading}
          >
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            Add VLAN
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
            <Button size="small" danger onClick={loadInterfaces}>
              Retry
            </Button>
          }
        />
      )}

      <Card bordered={false}>
        <Table
          dataSource={vlanInterfaces}
          columns={columns}
          rowKey="name"
          loading={loading}
          pagination={false}
          scroll={{ x: 1200 }}
          size="middle"
          locale={{
            emptyText: 'No VLAN interfaces configured',
          }}
        />
      </Card>

      {/* Add/Edit VLAN Modal */}
      <Modal
        title={modalMode === 'add' ? 'Add VLAN Interface' : 'Edit VLAN Interface'}
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
              label="VLAN Interface Name"
              name="name"
              extra="e.g., eth0.100 (will be auto-generated if left empty)"
            >
              <Input placeholder="eth0.100" />
            </Form.Item>
          )}

          <Form.Item
            label="Parent Interface"
            name="parent_interface"
            rules={[{ required: true, message: 'Please select parent interface' }]}
          >
            <Input placeholder="e.g., eth0" />
          </Form.Item>

          <Form.Item
            label="VLAN ID"
            name="vlan_id"
            rules={[
              { required: true, message: 'Please enter VLAN ID' },
              { type: 'number', min: 1, max: 4094, message: 'VLAN ID must be between 1 and 4094' },
            ]}
          >
            <InputNumber min={1} max={4094} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="Description" name="description">
            <Input placeholder="VLAN description" />
          </Form.Item>

          <Form.Item label="MTU" name="mtu">
            <InputNumber min={0} max={65536} style={{ width: '100%' }} placeholder="Leave empty for default" />
          </Form.Item>

          <div style={{ marginBottom: 24 }}>
            <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
              <Col>
                <Text strong>IP Addresses</Text>
              </Col>
              <Col>
                <Button
                  type="dashed"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    const current = form.getFieldValue('ip_addresses') || []
                    form.setFieldValue('ip_addresses', [...current, { address: '', cidr: 24 }])
                  }}
                >
                  Add IP
                </Button>
              </Col>
            </Row>

            <Form.List name="ip_addresses">
              {(fields, { remove }) => (
                <div>
                  {fields.length === 0 && (
                    <Text type="secondary" style={{ fontStyle: 'italic' }}>
                      No IP addresses configured. Click "Add IP" to add one.
                    </Text>
                  )}
                  {fields.map(({ key, name, ...restField }, index) => (
                    <Row key={key} gutter={8} style={{ marginBottom: 8 }} align="middle">
                      <Col span={14}>
                        <Form.Item
                          {...restField}
                          name={[name, 'address']}
                          rules={[
                            { required: true, message: 'IP required' },
                            {
                              pattern: /^(\d{1,3}\.){3}\d{1,3}$/,
                              message: 'Invalid IP format',
                            },
                          ]}
                          noStyle
                        >
                          <Input placeholder="e.g., 192.168.100.1" />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item
                          {...restField}
                          name={[name, 'cidr']}
                          rules={[{ required: true, message: 'CIDR required' }]}
                          noStyle
                        >
                          <InputNumber min={1} max={32} placeholder="24" style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => remove(name)}
                        />
                      </Col>
                    </Row>
                  ))}
                </div>
              )}
            </Form.List>
          </div>
        </Form>
      </Modal>
    </div>
  )
}
