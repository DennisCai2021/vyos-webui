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
  Descriptions,
  Drawer,
  Row,
  Col,
  Statistic,
  message,
  Popconfirm,
  Tooltip,
  Divider,
  Alert,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  ReloadOutlined,
  WifiOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  DashboardOutlined,
  InfoCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import type { NetworkInterface } from '../../api/types'
import { networkApi } from '../../api'
import apiClient from '../../api/client'

const { Title, Text } = Typography

interface InterfaceFormData {
  name: string
  description?: string
  ip_addresses?: Array<{ address: string; cidr: number }>
  gateway?: string
  mtu?: number
  dhcp?: boolean
  enabled: boolean
}

export default function Interfaces() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([])
  const [selectedInterface, setSelectedInterface] = useState<NetworkInterface | null>(null)
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add')
  const [form] = Form.useForm<InterfaceFormData>()

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

  const handleView = (record: NetworkInterface) => {
    setSelectedInterface(record)
    setDrawerVisible(true)
  }

  const handleEdit = (record: NetworkInterface) => {
    setModalMode('edit')
    setSelectedInterface(record)
    // Convert ip_addresses to form format
    const ipAddresses = record.ip_addresses?.map(ip => ({
      address: ip.address,
      cidr: ip.cidr
    })) || []
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      ip_addresses: ipAddresses,
      mtu: record.mtu,
      dhcp: record.dhcp,
      enabled: record.status === 'up',
    })
    setModalVisible(true)
  }

  const handleAdd = () => {
    setModalMode('add')
    setSelectedInterface(null)
    form.resetFields()
    form.setFieldsValue({ ip_addresses: [], mtu: 1500, enabled: true, dhcp: false })
    setModalVisible(true)
  }

  const handleModalOk = async () => {
    const hide = message.loading('正在保存接口配置...', 0)
    try {
      await form.validateFields()
      const values = form.getFieldsValue()

      if (modalMode === 'add') {
        // Create new interface
        await networkApi.createInterface({
          name: values.name,
          type: 'ethernet',
          description: values.description,
          mtu: values.mtu,
        })

        // Add IP addresses if provided
        if (values.ip_addresses && values.ip_addresses.length > 0 && !values.dhcp) {
          for (const ip of values.ip_addresses) {
            await apiClient.post(`/network/interfaces/${values.name}/ip-addresses`, {
              address: `${ip.address}/${ip.cidr}`,
            })
          }
        }
      } else {
        // Update existing interface - only description and MTU
        const updateData: any = {}
        if (values.description !== undefined) {
          updateData.description = values.description
        }
        if (values.mtu !== undefined && values.mtu !== null && values.mtu !== 0) {
          updateData.mtu = values.mtu
        }

        // Only send update if there are actual changes
        if (Object.keys(updateData).length > 0) {
          await networkApi.updateInterface(values.name, updateData)
        }

        // Handle IP address updates
        if (values.ip_addresses && !values.dhcp) {
          const currentIface = interfaces.find(i => i.name === values.name)
          const currentIps = currentIface?.ip_addresses || []
          const newIps = values.ip_addresses

          // Create sets for comparison
          const currentIpSet = new Set(currentIps.map(ip => `${ip.address}/${ip.cidr}`))
          const newIpSet = new Set(newIps.map(ip => `${ip.address}/${ip.cidr}`))

          // Add new IPs
          for (const ip of newIps) {
            const ipStr = `${ip.address}/${ip.cidr}`
            if (!currentIpSet.has(ipStr)) {
              try {
                await apiClient.post(`/network/interfaces/${values.name}/ip-addresses`, {
                  address: ipStr,
                })
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
                await apiClient.delete(`/network/interfaces/${values.name}/ip-addresses/${encodeURIComponent(ipStr)}`)
              } catch (e: any) {
                console.warn('Failed to remove IP:', e)
              }
            }
          }
        }
      }

      hide()
      message.success(`接口${modalMode === 'add' ? '创建' : '更新'}成功！`)
      setModalVisible(false)
      loadInterfaces()
    } catch (error: any) {
      hide()
      console.error('Failed to save interface:', error)
      message.error(`保存失败: ${error.message || `Failed to ${modalMode === 'add' ? 'create' : 'update'} interface`}`)
    }
  }

  const handleDelete = async (record: NetworkInterface) => {
    try {
      await networkApi.deleteInterface(record.name)
      message.success(`Interface ${record.name} deleted`)
      loadInterfaces()
    } catch (error: any) {
      message.error(error.message || 'Failed to delete interface')
    }
  }

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = bytes
    let unitIndex = 0
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`
  }

  const columns = [
    {
      title: 'Interface',
      dataIndex: 'name',
      key: 'name',
      fixed: 'left' as const,
      width: 120,
      render: (name: string) => (
        <Space>
          <WifiOutlined />
          <Text strong>{name}</Text>
        </Space>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 150,
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
              <Tag key={idx} style={{ marginBottom: 4 }}>
                <Text code>{ip.address}/{ip.cidr}</Text>
              </Tag>
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
        <Tag color={status === 'up' ? 'green' : 'red'} icon={status === 'up' ? <DashboardOutlined /> : undefined}>
          {status === 'up' ? 'UP' : 'DOWN'}
        </Tag>
      ),
    },
    {
      title: 'DHCP',
      dataIndex: 'dhcp',
      key: 'dhcp',
      width: 80,
      render: (dhcp?: boolean) => <Tag color={dhcp ? 'blue' : 'default'}>{dhcp ? 'Yes' : 'No'}</Tag>,
    },
    {
      title: 'Speed',
      dataIndex: 'speed',
      key: 'speed',
      width: 100,
    },
    {
      title: 'RX',
      dataIndex: 'rx_bytes',
      key: 'rx_bytes',
      width: 100,
      render: (_: any, record: NetworkInterface) => (
        <Tooltip title={`Rate: ${((record.rx_rate || 0) / 1000000).toFixed(2)} Mbps`}>
          <Text type="secondary">
            <ArrowDownOutlined /> {formatBytes(record.rx_bytes)}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: 'TX',
      dataIndex: 'tx_bytes',
      key: 'tx_bytes',
      width: 100,
      render: (_: any, record: NetworkInterface) => (
        <Tooltip title={`Rate: ${((record.tx_rate || 0) / 1000000).toFixed(2)} Mbps`}>
          <Text type="secondary">
            <ArrowUpOutlined /> {formatBytes(record.tx_bytes)}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: 'MTU',
      dataIndex: 'mtu',
      key: 'mtu',
      width: 80,
    render: (mtu?: number) => <Text type="secondary">{mtu || '-'}</Text>,
    },
    {
      title: 'MAC Address',
      dataIndex: 'mac_address',
      key: 'mac_address',
      width: 150,
      render: (mac?: string) => <Text type="secondary" code>{mac || 'N/A'}</Text>,
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right' as const,
      width: 120,
      render: (_: any, record: NetworkInterface) => (
        <Space size="small">
          <Tooltip title="View Details">
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handleView(record)} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
          {record.name !== 'lo' && (
            <Popconfirm
              title="Delete Interface"
              description="Are you sure you want to delete this interface?"
              onConfirm={() => handleDelete(record)}
              okText="Yes"
              cancelText="No"
            >
              <Tooltip title="Delete">
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>
            Network Interfaces
          </Title>
          <Text type="secondary">Manage network interfaces and IP configuration</Text>
        </Col>
        <Col>
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
              Add Interface
            </Button>
          </Space>
        </Col>
      </Row>

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
          dataSource={interfaces}
          columns={columns}
          rowKey="name"
          loading={loading}
          pagination={false}
          scroll={{ x: 1400 }}
          size="middle"
        />
      </Card>

      {/* Interface Details Drawer */}
      <Drawer
        title={`Interface Details: ${selectedInterface?.name}`}
        placement="right"
        width={600}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      >
        {selectedInterface && (
          <div>
            <Descriptions title="Basic Information" bordered column={1}>
              <Descriptions.Item label="Name">
                <Space><WifiOutlined /> <Text strong>{selectedInterface.name}</Text></Space>
              </Descriptions.Item>
              <Descriptions.Item label="Description">
                {selectedInterface.description || 'N/A'}
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={selectedInterface.status === 'up' ? 'green' : 'red'}>
                  {selectedInterface.status.toUpperCase()}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="MAC Address">
                <Text code>{selectedInterface.mac_address || 'N/A'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="MTU">{selectedInterface.mtu || 'N/A'}</Descriptions.Item>
              <Descriptions.Item label="Speed">{selectedInterface.speed || 'N/A'}</Descriptions.Item>
              <Descriptions.Item label="Duplex">{selectedInterface.duplex?.toUpperCase() || 'N/A'}</Descriptions.Item>
              <Descriptions.Item label="DHCP">
                <Tag color={selectedInterface.dhcp ? 'blue' : 'default'}>
                  {selectedInterface.dhcp ? 'Enabled' : 'Disabled'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: '24px 0' }} />

            <Title level={4}>IP Addresses</Title>
            {selectedInterface.ip_addresses && selectedInterface.ip_addresses.length > 0 ? (
              selectedInterface.ip_addresses.map((ip, idx) => (
                <Card key={idx} size="small" style={{ marginBottom: 8 }}>
                  <Text code>{ip.address}/{ip.cidr}</Text>
                  {ip.gateway && <div style={{ marginTop: 4 }}><Text type="secondary">Gateway: {ip.gateway}</Text></div>}
                  {ip.dhcp && <Tag style={{ marginLeft: 8 }}>DHCP</Tag>}
                </Card>
              ))
            ) : (
              <Text type="secondary">No IP addresses configured</Text>
            )}

            <Divider style={{ margin: '24px 0' }} />

            <Title level={4}>Traffic Statistics</Title>
            <Row gutter={16}>
              <Col span={12}>
                <Card size="small">
                  <Statistic
                    title="Received (RX)"
                    value={selectedInterface.rx_bytes || 0}
                    formatter={(value) => formatBytes(value as number)}
                    prefix={<ArrowDownOutlined />}
                  />
                  <div style={{ marginTop: 8, textAlign: 'center' }}>
                    <Text type="secondary">
                      Rate: {((selectedInterface.rx_rate || 0) / 1000000).toFixed(2)} Mbps
                    </Text>
                  </div>
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small">
                  <Statistic
                    title="Transmitted (TX)"
                    value={selectedInterface.tx_bytes || 0}
                    formatter={(value) => formatBytes(value as number)}
                    prefix={<ArrowUpOutlined />}
                  />
                  <div style={{ marginTop: 8, textAlign: 'center' }}>
                    <Text type="secondary">
                      Rate: {((selectedInterface.tx_rate || 0) / 1000000).toFixed(2)} Mbps
                    </Text>
                  </div>
                </Card>
              </Col>
            </Row>
          </div>
        )}
      </Drawer>

      {/* Add/Edit Interface Modal */}
      <Modal
        title={modalMode === 'add' ? 'Add Interface' : 'Edit Interface'}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => setModalVisible(false)}
        width={700}
        okText="Save"
        cancelText="Cancel"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="Interface Name"
            name="name"
            rules={[{ required: true, message: 'Please enter interface name' }]}
          >
            <Input
              placeholder="e.g., eth0"
              disabled={modalMode === 'edit'}
              suffix={<InfoCircleOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />}
            />
          </Form.Item>

          <Form.Item label="Description" name="description">
            <Input placeholder="Interface description" />
          </Form.Item>

          <Form.Item label="Enable DHCP" name="dhcp" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.dhcp !== curr.dhcp}>
            {({ getFieldValue, setFieldValue }) => {
              const isDhcp = getFieldValue('dhcp')
              const ipAddresses = getFieldValue('ip_addresses') || []

              const addIpAddress = () => {
                const current = getFieldValue('ip_addresses') || []
                setFieldValue('ip_addresses', [...current, { address: '', cidr: 24 }])
              }

              const removeIpAddress = (index: number) => {
                const current = getFieldValue('ip_addresses') || []
                setFieldValue('ip_addresses', current.filter((_, i) => i !== index))
              }

              return (
                <>
                  {!isDhcp && (
                    <>
                      <div style={{ marginBottom: 16 }}>
                        <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
                          <Col>
                            <Text strong>IP Addresses</Text>
                          </Col>
                          <Col>
                            <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addIpAddress}>
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
                                      <Input placeholder="e.g., 192.168.1.1" />
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
                    </>
                  )}
                </>
              )
            }}
          </Form.Item>

          <Form.Item label="MTU" name="mtu">
            <InputNumber min={0} max={65536} style={{ width: '100%' }} placeholder="Leave empty for default" />
          </Form.Item>

          <Form.Item label="Enabled" name="enabled" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
