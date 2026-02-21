import { useState, useEffect } from 'react'
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Typography,
  Tabs,
  message,
  Row,
  Col,
  Statistic,
  Alert,
  Badge,
  Modal,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Tooltip,
  Select,
  Switch,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CloudUploadOutlined,
  CloudDownloadOutlined,
  GlobalOutlined,
  LockOutlined,
  ThunderboltOutlined,
  WifiOutlined,
  ShareAltOutlined,
  UserOutlined,
  SettingOutlined,
  TeamOutlined,
  EditOutlined,
  SafetyOutlined,
  CopyOutlined,
} from '@ant-design/icons'
import type {
  IPVPNTunnel,
  OpenVPNTunnel,
  WireGuardInterface,
  VPNStatistics,
  VPNTrafficStats,
  WireGuardInterfaceCreate,
  WireGuardInterfaceUpdate,
  WireGuardPeerAdd,
  IPsecPeer,
  IPsecPeerCreate,
  IPsecTunnelAdd,
  IPsecConfig,
  OpenVPNInstance,
  OpenVPNCreate,
  OpenVPNConfig,
} from '../../api/types'
import { vpnApi } from '../../api'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

const { Title, Text } = Typography

// Generate WireGuard private key (32 bytes random, base64 encoded)
const generateWireGuardPrivateKey = (): string => {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode.apply(null, array as unknown as number[]))
}

const formatBytes = (bytes?: number): string => {
  if (bytes === undefined || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

const getStatusBadge = (status: string, enabled: boolean): React.ReactNode => {
  if (!enabled) {
    return <Badge status="warning" text="Disabled" />
  }

  const statusMap: Record<string, { status: 'success' | 'error' | 'processing' | 'warning'; text: string }> = {
    connected: { status: 'success', text: 'Connected' },
    disconnected: { status: 'error', text: 'Disconnected' },
    connecting: { status: 'processing', text: 'Connecting' },
    error: { status: 'error', text: 'Error' },
    active: { status: 'success', text: 'Active' },
    inactive: { status: 'warning', text: 'Inactive' },
    waiting: { status: 'warning', text: 'Waiting' },
  }

  const config = statusMap[status] || { status: 'warning' as const, text: status }
  return <Badge status={config.status} text={config.text} />
}

// WireGuard Interface Form
interface WireGuardFormData {
  name: string
  private_key: string
  address?: string
  listen_port?: number
  mtu?: number
  description?: string
}

// WireGuard Peer Form
interface WireGuardPeerFormData {
  name: string
  public_key: string
  allowed_ips?: string
  endpoint?: string
  endpoint_port?: number
  persistent_keepalive?: number
}

// IPsec Peer Form
interface IPsecPeerFormData {
  name: string
  remote_address: string
  local_address?: string
  pre_shared_key?: string
  description?: string
  ike_group?: number
  esp_group?: number
}

// OpenVPN Form
interface OpenVPNFormData {
  name: string
  mode?: string
  protocol?: string
  port?: number
  device?: string
  description?: string
}

export default function VPN() {
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('wireguard')

  const [ipsecPeers, setIpsecPeers] = useState<IPsecPeer[]>([])
  const [openvpnInstances, setOpenvpnInstances] = useState<OpenVPNInstance[]>([])
  const [wireguardInterfaces, setWireguardInterfaces] = useState<WireGuardInterface[]>([])

  const [vpnStats, setVpnStats] = useState<VPNStatistics | null>(null)
  const [trafficStats, setTrafficStats] = useState<VPNTrafficStats[]>([])

  // WireGuard Modal State
  const [wgModalVisible, setWgModalVisible] = useState(false)
  const [wgModalMode, setWgModalMode] = useState<'add' | 'edit'>('add')
  const [selectedWgInterface, setSelectedWgInterface] = useState<WireGuardInterface | null>(null)
  const [wgForm] = Form.useForm<WireGuardFormData>()

  // WireGuard Peer Modal State
  const [wgPeerModalVisible, setWgPeerModalVisible] = useState(false)
  const [selectedWgForPeer, setSelectedWgForPeer] = useState<string | null>(null)
  const [wgPeerForm] = Form.useForm<WireGuardPeerFormData>()

  // IPsec Modal State
  const [ipsecModalVisible, setIpsecModalVisible] = useState(false)
  const [ipsecForm] = Form.useForm<IPsecPeerFormData>()

  // OpenVPN Modal State
  const [openvpnModalVisible, setOpenvpnModalVisible] = useState(false)
  const [openvpnForm] = Form.useForm<OpenVPNFormData>()

  const loadIpsecConfig = async () => {
    setLoading(true)
    try {
      const data = await vpnApi.getIPsecConfig()
      setIpsecPeers(data.peers || [])
    } catch (error: any) {
      console.error('Failed to load IPsec config:', error)
      setIpsecPeers([])
    } finally {
      setLoading(false)
    }
  }

  const loadOpenvpnConfig = async () => {
    setLoading(true)
    try {
      const data = await vpnApi.getOpenVPNConfig()
      setOpenvpnInstances(data.instances || [])
    } catch (error: any) {
      console.error('Failed to load OpenVPN config:', error)
      setOpenvpnInstances([])
    } finally {
      setLoading(false)
    }
  }

  const loadWireguardInterfaces = async () => {
    setLoading(true)
    try {
      const data = await vpnApi.getWireGuardInterfaces()
      setWireguardInterfaces(data)
    } catch (error: any) {
      console.error('Failed to load WireGuard interfaces:', error)
      setWireguardInterfaces([])
    } finally {
      setLoading(false)
    }
  }

  const loadVPNStatistics = async () => {
    try {
      const data = await vpnApi.getVPNStatistics()
      setVpnStats(data)
    } catch (error: any) {
      console.error(error)
    }
  }

  const loadData = async () => {
    await Promise.all([
      loadWireguardInterfaces(),
      loadVPNStatistics(),
    ])
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (activeTab === 'ipsec') {
      loadIpsecConfig()
    } else if (activeTab === 'openvpn') {
      loadOpenvpnConfig()
    } else if (activeTab === 'wireguard') {
      loadWireguardInterfaces()
    }
  }, [activeTab])

  // WireGuard Handlers
  const handleAddWgInterface = () => {
    setWgModalMode('add')
    setSelectedWgInterface(null)
    wgForm.resetFields()
    wgForm.setFieldsValue({
      name: 'wg0',
      private_key: generateWireGuardPrivateKey(),
      listen_port: 51820,
      mtu: 1420,
    })
    setWgModalVisible(true)
  }

  const handleGenerateWgKey = () => {
    const newKey = generateWireGuardPrivateKey()
    wgForm.setFieldsValue({ private_key: newKey })
    message.success('WireGuard private key generated!')
  }

  const handleEditWgInterface = (record: WireGuardInterface) => {
    setWgModalMode('edit')
    setSelectedWgInterface(record)
    wgForm.setFieldsValue({
      name: record.name,
      private_key: record.private_key,
      address: record.address,
      listen_port: record.listen_port,
      mtu: record.mtu,
      description: record.description,
    })
    setWgModalVisible(true)
  }

  const handleWgModalOk = async () => {
    const hide = message.loading('正在保存 WireGuard 配置...', 0)
    try {
      await wgForm.validateFields()
      const values = wgForm.getFieldsValue()

      if (wgModalMode === 'add') {
        await vpnApi.createWireGuardInterface({
          name: values.name,
          private_key: values.private_key,
          address: values.address,
          listen_port: values.listen_port,
          mtu: values.mtu,
          description: values.description,
        })
      } else {
        if (selectedWgInterface) {
          await vpnApi.updateWireGuardInterface(selectedWgInterface.name!, {
            address: values.address,
            private_key: values.private_key || undefined,
            listen_port: values.listen_port,
            mtu: values.mtu,
            description: values.description,
          })
        }
      }

      hide()
      message.success(`WireGuard ${wgModalMode === 'add' ? '创建' : '更新'}成功！`)
      setWgModalVisible(false)
      loadWireguardInterfaces()
    } catch (error: any) {
      hide()
      console.error('Failed to save WireGuard:', error)
      message.error(`保存失败: ${error.message || `Failed to ${wgModalMode === 'add' ? 'create' : 'update'} WireGuard`}`)
    }
  }

  const handleDeleteWgInterface = async (record: WireGuardInterface) => {
    const hide = message.loading('正在删除 WireGuard...', 0)
    try {
      await vpnApi.deleteWireGuardInterface(record.name!)
      hide()
      message.success(`WireGuard ${record.name} deleted`)
      loadWireguardInterfaces()
    } catch (error: any) {
      hide()
      message.error(error.message || 'Failed to delete WireGuard')
    }
  }

  const handleAddWgPeer = (interfaceName: string) => {
    setSelectedWgForPeer(interfaceName)
    wgPeerForm.resetFields()
    wgPeerForm.setFieldsValue({
      persistent_keepalive: 25,
    })
    setWgPeerModalVisible(true)
  }

  const handleWgPeerModalOk = async () => {
    if (!selectedWgForPeer) return

    const hide = message.loading('正在添加 Peer...', 0)
    try {
      await wgPeerForm.validateFields()
      const values = wgPeerForm.getFieldsValue()

      await vpnApi.addWireGuardPeer(selectedWgForPeer, {
        name: values.name,
        public_key: values.public_key,
        allowed_ips: values.allowed_ips,
        endpoint: values.endpoint,
        endpoint_port: values.endpoint_port,
        persistent_keepalive: values.persistent_keepalive,
      })

      hide()
      message.success('Peer 添加成功！')
      setWgPeerModalVisible(false)
      loadWireguardInterfaces()
    } catch (error: any) {
      hide()
      console.error('Failed to add peer:', error)
      message.error(`添加失败: ${error.message}`)
    }
  }

  const handleDeleteWgPeer = async (interfaceName: string, peerName: string) => {
    const hide = message.loading('正在删除 Peer...', 0)
    try {
      await vpnApi.removeWireGuardPeer(interfaceName, peerName)
      hide()
      message.success('Peer 删除成功')
      loadWireguardInterfaces()
    } catch (error: any) {
      hide()
      message.error(error.message || 'Failed to delete peer')
    }
  }

  // IPsec Handlers
  const handleAddIpsecPeer = () => {
    ipsecForm.resetFields()
    ipsecForm.setFieldsValue({
      ike_group: 14,
      esp_group: 14,
    })
    setIpsecModalVisible(true)
  }

  const handleIpsecModalOk = async () => {
    const hide = message.loading('正在保存 IPsec 配置...', 0)
    try {
      await ipsecForm.validateFields()
      const values = ipsecForm.getFieldsValue()

      await vpnApi.createIPsecPeer({
        name: values.name,
        remote_address: values.remote_address,
        local_address: values.local_address,
        pre_shared_key: values.pre_shared_key,
        description: values.description,
        ike_group: values.ike_group,
        esp_group: values.esp_group,
      })

      hide()
      message.success('IPsec Peer 创建成功！')
      setIpsecModalVisible(false)
      loadIpsecConfig()
    } catch (error: any) {
      hide()
      console.error('Failed to save IPsec:', error)
      message.error(`保存失败: ${error.message}`)
    }
  }

  const handleDeleteIpsecPeer = async (record: IPsecPeer) => {
    const hide = message.loading('正在删除 IPsec Peer...', 0)
    try {
      await vpnApi.deleteIPsecPeer(record.name)
      hide()
      message.success(`IPsec Peer ${record.name} deleted`)
      loadIpsecConfig()
    } catch (error: any) {
      hide()
      message.error(error.message || 'Failed to delete IPsec Peer')
    }
  }

  // OpenVPN Handlers
  const handleAddOpenvpn = () => {
    openvpnForm.resetFields()
    openvpnForm.setFieldsValue({
      mode: 'server',
      protocol: 'udp',
      port: 1194,
      device: 'tun0',
    })
    setOpenvpnModalVisible(true)
  }

  const handleOpenvpnModalOk = async () => {
    const hide = message.loading('正在保存 OpenVPN 配置...', 0)
    try {
      await openvpnForm.validateFields()
      const values = openvpnForm.getFieldsValue()

      await vpnApi.createOpenVPNInstance({
        name: values.name,
        mode: values.mode,
        protocol: values.protocol,
        port: values.port,
        device: values.device,
        description: values.description,
      })

      hide()
      message.success('OpenVPN 创建成功！')
      setOpenvpnModalVisible(false)
      loadOpenvpnConfig()
    } catch (error: any) {
      hide()
      console.error('Failed to save OpenVPN:', error)
      message.error(`保存失败: ${error.message}`)
    }
  }

  const handleDeleteOpenvpn = async (record: OpenVPNInstance) => {
    const hide = message.loading('正在删除 OpenVPN...', 0)
    try {
      await vpnApi.deleteOpenVPNInstance(record.name)
      hide()
      message.success(`OpenVPN ${record.name} deleted`)
      loadOpenvpnConfig()
    } catch (error: any) {
      hide()
      message.error(error.message || 'Failed to delete OpenVPN')
    }
  }

  const handleRefresh = () => {
    if (activeTab === 'ipsec') loadIpsecConfig()
    else if (activeTab === 'openvpn') loadOpenvpnConfig()
    else if (activeTab === 'wireguard') loadWireguardInterfaces()
    loadVPNStatistics()
  }

  const wireguardColumns = [
    {
      title: 'Interface',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      render: (name?: string) => <Text strong>{name || '-'}</Text>,
    },
    {
      title: 'Address',
      dataIndex: 'address',
      key: 'address',
      width: 150,
      render: (addr?: string) => <Text code>{addr || '-'}</Text>,
    },
    {
      title: 'Public Key',
      dataIndex: 'public_key',
      key: 'public_key',
      width: 300,
      render: (pubkey?: string, record: WireGuardInterface) => (
        <Space>
          <Text code style={{ fontSize: '12px' }} ellipsis={{ tooltip: pubkey }}>
            {pubkey ? `${pubkey.substring(0, 24)}...` : '-'}
          </Text>
          {pubkey && (
            <Tooltip title="Copy public key">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={() => {
                  navigator.clipboard.writeText(pubkey)
                  message.success('Public key copied to clipboard!')
                }}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: 'Listen Port',
      dataIndex: 'listen_port',
      key: 'listen_port',
      width: 100,
      render: (port?: number) => <Text code>{port || '-'}</Text>,
    },
    {
      title: 'MTU',
      dataIndex: 'mtu',
      key: 'mtu',
      width: 80,
      render: (mtu?: number) => <Text>{mtu || '-'}</Text>,
    },
    {
      title: 'Peers',
      key: 'peers',
      width: 80,
      render: (_: any, record: WireGuardInterface) => (
        <Tag color="blue">{record.peers?.length || 0}</Tag>
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
      title: 'Actions',
      key: 'actions',
      fixed: 'right' as const,
      width: 180,
      render: (_: any, record: WireGuardInterface) => (
        <Space size="small">
          <Tooltip title="Add Peer">
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => handleAddWgPeer(record.name!)}
            />
          </Tooltip>
          <Tooltip title="Edit">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEditWgInterface(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete WireGuard"
            description="Are you sure you want to delete this WireGuard interface?"
            onConfirm={() => handleDeleteWgInterface(record)}
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

  const ipsecColumns = [
    {
      title: 'Peer Name',
      dataIndex: 'name',
      key: 'name',
      width: 140,
      render: (name?: string) => <Text strong>{name || '-'}</Text>,
    },
    {
      title: 'Remote Address',
      dataIndex: 'remote_address',
      key: 'remote_address',
      width: 140,
      render: (addr?: string) => <Text code>{addr || '-'}</Text>,
    },
    {
      title: 'Local Address',
      dataIndex: 'local_address',
      key: 'local_address',
      width: 140,
      render: (addr?: string) => <Text code>{addr || '-'}</Text>,
    },
    {
      title: 'IKE/ESP Group',
      key: 'groups',
      width: 120,
      render: (_: any, record: IPsecPeer) => (
        <Space>
          <Tag color="blue">IKE:{record.ike_group || '-'}</Tag>
          <Tag color="purple">ESP:{record.esp_group || '-'}</Tag>
        </Space>
      ),
    },
    {
      title: 'Tunnels',
      key: 'tunnels',
      width: 80,
      render: (_: any, record: IPsecPeer) => (
        <Tag>{record.tunnels?.length || 0}</Tag>
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
      title: 'Actions',
      key: 'actions',
      fixed: 'right' as const,
      width: 120,
      render: (_: any, record: IPsecPeer) => (
        <Space size="small">
          <Popconfirm
            title="Delete IPsec Peer"
            description="Are you sure you want to delete this IPsec peer?"
            onConfirm={() => handleDeleteIpsecPeer(record)}
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

  const openvpnColumns = [
    {
      title: 'Instance',
      dataIndex: 'name',
      key: 'name',
      width: 140,
      render: (name?: string) => <Text strong>{name || '-'}</Text>,
    },
    {
      title: 'Mode',
      dataIndex: 'mode',
      key: 'mode',
      width: 100,
      render: (mode?: string) => (
        <Tag color="purple" icon={<UserOutlined />}>
          {mode?.toUpperCase() || '-'}
        </Tag>
      ),
    },
    {
      title: 'Protocol',
      dataIndex: 'protocol',
      key: 'protocol',
      width: 100,
      render: (proto?: string) => <Tag color="blue">{proto?.toUpperCase() || '-'}</Tag>,
    },
    {
      title: 'Port',
      dataIndex: 'port',
      key: 'port',
      width: 80,
      render: (port?: number) => <Text code>{port || '-'}</Text>,
    },
    {
      title: 'Device',
      dataIndex: 'device',
      key: 'device',
      width: 100,
      render: (device?: string) => <Text code>{device || '-'}</Text>,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 150,
      render: (desc?: string) => <Text type="secondary">{desc || '-'}</Text>,
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right' as const,
      width: 120,
      render: (_: any, record: OpenVPNInstance) => (
        <Space size="small">
          <Popconfirm
            title="Delete OpenVPN"
            description="Are you sure you want to delete this OpenVPN instance?"
            onConfirm={() => handleDeleteOpenvpn(record)}
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

  const renderWireGuardPeers = (record: WireGuardInterface) => {
    if (!record.peers || record.peers.length === 0) {
      return (
        <div style={{ padding: '16px 0', color: '#999', textAlign: 'center' }}>
          No peers configured
        </div>
      )
    }

    return (
      <Table
        dataSource={record.peers}
        rowKey="id"
        size="small"
        pagination={false}
        columns={[
          {
            title: 'Peer Name',
            dataIndex: 'name',
            key: 'name',
            width: 120,
          },
          {
            title: 'Public Key',
            dataIndex: 'public_key',
            key: 'public_key',
            width: 300,
            render: (key: string) => (
              <Text code style={{ fontSize: '12px' }}>
                {key.substring(0, 20)}...
              </Text>
            ),
          },
          {
            title: 'Allowed IPs',
            dataIndex: 'allowed_ips',
            key: 'allowed_ips',
            width: 150,
            render: (ips: string[]) => ips?.join(', ') || '-',
          },
          {
            title: 'Endpoint',
            key: 'endpoint',
            width: 150,
            render: (_: any, peer: any) => (
              <Text code>
                {peer.endpoint ? `${peer.endpoint}${peer.endpoint_port ? ':' + peer.endpoint_port : ''}` : '-'}
              </Text>
            ),
          },
          {
            title: 'Keepalive',
            dataIndex: 'persistent_keepalive',
            key: 'persistent_keepalive',
            width: 100,
            render: (sec?: number) => sec ? `${sec}s` : '-',
          },
          {
            title: 'Actions',
            key: 'actions',
            width: 80,
            render: (_: any, peer: any) => (
              <Popconfirm
                title="Delete Peer"
                description="Are you sure you want to delete this peer?"
                onConfirm={() => handleDeleteWgPeer(record.name!, peer.name)}
                okText="Yes"
                cancelText="No"
              >
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]}
      />
    )
  }

  const tabItems = [
    {
      key: 'wireguard',
      label: <span><TeamOutlined /> WireGuard</span>,
      children: (
        <>
          <Alert
            message="WireGuard Configuration"
            description="Configure modern, high-performance WireGuard VPN tunnels."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Table
            dataSource={wireguardInterfaces}
            columns={wireguardColumns}
            rowKey="id"
            loading={loading}
            pagination={false}
            scroll={{ x: 1000 }}
            size="middle"
            expandable={{
              expandedRowRender: (record) => (
                <div style={{ padding: '0 16px 16px' }}>
                  <Title level={5}>Peers</Title>
                  {renderWireGuardPeers(record)}
                </div>
              ),
            }}
            locale={{
              emptyText: 'No WireGuard interfaces configured',
            }}
          />

          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddWgInterface}>
              Add WireGuard Interface
            </Button>
          </div>
        </>
      ),
    },
    {
      key: 'ipsec',
      label: <span><GlobalOutlined /> IPsec VPN</span>,
      children: (
        <>
          <Alert
            message="IPsec VPN Configuration"
            description="Configure site-to-site IPsec VPN tunnels."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Table
            dataSource={ipsecPeers}
            columns={ipsecColumns}
            rowKey="name"
            loading={loading}
            pagination={false}
            scroll={{ x: 1000 }}
            size="middle"
            locale={{
              emptyText: 'No IPsec peers configured',
            }}
          />

          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddIpsecPeer}>
              Add IPsec Peer
            </Button>
          </div>
        </>
      ),
    },
    {
      key: 'openvpn',
      label: <span><WifiOutlined /> OpenVPN</span>,
      children: (
        <>
          <Alert
            message="OpenVPN Configuration"
            description="Configure OpenVPN server and client instances."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Table
            dataSource={openvpnInstances}
            columns={openvpnColumns}
            rowKey="name"
            loading={loading}
            pagination={false}
            scroll={{ x: 1000 }}
            size="middle"
            locale={{
              emptyText: 'No OpenVPN instances configured',
            }}
          />

          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddOpenvpn}>
              Add OpenVPN Instance
            </Button>
          </div>
        </>
      ),
    },
    {
      key: 'stats',
      label: <span><SettingOutlined /> Traffic Statistics</span>,
      children: (
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={trafficStats}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            />
            <YAxis tickFormatter={(value) => formatBytes(value)} />
            <RechartsTooltip
              labelFormatter={(value) => new Date(value as string).toLocaleString()}
              formatter={(value: number | undefined, name: string | undefined) => [formatBytes(value || 0), name || '']}
            />
            <Legend />
            <Line type="monotone" dataKey="ipsec_rx_bytes" stroke="#1890ff" name="IPsec RX" dot={false} />
            <Line type="monotone" dataKey="ipsec_tx_bytes" stroke="#52c41a" name="IPsec TX" dot={false} />
            <Line type="monotone" dataKey="openvpn_rx_bytes" stroke="#fa8c16" name="OpenVPN RX" dot={false} />
            <Line type="monotone" dataKey="openvpn_tx_bytes" stroke="#722ed1" name="OpenVPN TX" dot={false} />
            <Line type="monotone" dataKey="wireguard_rx_bytes" stroke="#eb2f96" name="WireGuard RX" dot={false} />
            <Line type="monotone" dataKey="wireguard_tx_bytes" stroke="#13c2c2" name="WireGuard TX" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      ),
    },
  ]

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>
            VPN Management
          </Title>
          <Text type="secondary">Configure and manage IPsec, OpenVPN, and WireGuard connections</Text>
        </Col>
        <Col>
          <Button type="default" icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>
            Refresh
          </Button>
        </Col>
      </Row>

      {vpnStats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} md={6}>
            <Card bordered={false}>
              <Statistic
                title="Total Tunnels"
                value={vpnStats.total_tunnels}
                prefix={<GlobalOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card bordered={false}>
              <Statistic
                title="Active Connections"
                value={vpnStats.active_tunnels}
                prefix={<ThunderboltOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card bordered={false}>
              <Statistic
                title="Traffic In"
                value={formatBytes(vpnStats.total_bytes_in)}
                prefix={<CloudDownloadOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card bordered={false}>
              <Statistic
                title="Traffic Out"
                value={formatBytes(vpnStats.total_bytes_out)}
                prefix={<CloudUploadOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Card bordered={false}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </Card>

      {/* WireGuard Interface Modal */}
      <Modal
        title={wgModalMode === 'add' ? 'Add WireGuard Interface' : 'Edit WireGuard Interface'}
        open={wgModalVisible}
        onOk={handleWgModalOk}
        onCancel={() => setWgModalVisible(false)}
        width={600}
        okText="Save"
        cancelText="Cancel"
      >
        <Form form={wgForm} layout="vertical">
          {wgModalMode === 'add' && (
            <Form.Item
              label="Interface Name"
              name="name"
              rules={[{ required: true, message: 'Please enter interface name' }]}
              extra="e.g., wg0, wg1"
            >
              <Input placeholder="wg0" />
            </Form.Item>
          )}

          <Form.Item
            label="Private Key"
            name="private_key"
            rules={wgModalMode === 'add' ? [{ required: true, message: 'Please enter private key' }] : []}
            extra={wgModalMode === 'edit' ? 'Leave empty to keep current key' : 'WireGuard private key'}
          >
            <Input.Password
              placeholder="Private key"
              addonAfter={
                <Tooltip title="Generate random key">
                  <Button
                    type="text"
                    size="small"
                    icon={<SafetyOutlined />}
                    onClick={handleGenerateWgKey}
                  />
                </Tooltip>
              }
            />
          </Form.Item>

          <Form.Item
            label="Address"
            name="address"
            extra="IP address with CIDR, e.g., 10.0.0.1/24"
          >
            <Input placeholder="10.0.0.1/24" />
          </Form.Item>

          <Form.Item
            label="Listen Port"
            name="listen_port"
          >
            <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="51820" />
          </Form.Item>

          <Form.Item
            label="MTU"
            name="mtu"
          >
            <InputNumber min={1280} max={9000} style={{ width: '100%' }} placeholder="1420" />
          </Form.Item>

          <Form.Item
            label="Description"
            name="description"
          >
            <Input placeholder="Description" />
          </Form.Item>
        </Form>
      </Modal>

      {/* WireGuard Peer Modal */}
      <Modal
        title="Add WireGuard Peer"
        open={wgPeerModalVisible}
        onOk={handleWgPeerModalOk}
        onCancel={() => setWgPeerModalVisible(false)}
        width={600}
        okText="Add"
        cancelText="Cancel"
      >
        <Form form={wgPeerForm} layout="vertical">
          <Form.Item
            label="Peer Name"
            name="name"
            rules={[{ required: true, message: 'Please enter peer name' }]}
          >
            <Input placeholder="peer0" />
          </Form.Item>

          <Form.Item
            label="Public Key"
            name="public_key"
            rules={[{ required: true, message: 'Please enter public key' }]}
          >
            <Input placeholder="Peer's public key" />
          </Form.Item>

          <Form.Item
            label="Allowed IPs"
            name="allowed_ips"
            extra="Allowed IP addresses for this peer, e.g., 10.0.0.2/32 or 0.0.0.0/0"
          >
            <Input placeholder="10.0.0.2/32" />
          </Form.Item>

          <Form.Item
            label="Endpoint (Optional)"
            name="endpoint"
            extra="Peer's public IP address or hostname"
          >
            <Input placeholder="vpn.example.com" />
          </Form.Item>

          <Form.Item
            label="Endpoint Port (Optional)"
            name="endpoint_port"
          >
            <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="51820" />
          </Form.Item>

          <Form.Item
            label="Persistent Keepalive (Optional)"
            name="persistent_keepalive"
            extra="Seconds between keepalive packets (useful for NAT)"
          >
            <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder="25" />
          </Form.Item>
        </Form>
      </Modal>

      {/* IPsec Peer Modal */}
      <Modal
        title="Add IPsec Peer"
        open={ipsecModalVisible}
        onOk={handleIpsecModalOk}
        onCancel={() => setIpsecModalVisible(false)}
        width={600}
        okText="Add"
        cancelText="Cancel"
      >
        <Form form={ipsecForm} layout="vertical">
          <Form.Item
            label="Peer Name"
            name="name"
            rules={[{ required: true, message: 'Please enter peer name' }]}
          >
            <Input placeholder="vpn-site1" />
          </Form.Item>

          <Form.Item
            label="Remote Address"
            name="remote_address"
            rules={[{ required: true, message: 'Please enter remote address' }]}
            extra="Remote VPN endpoint IP address"
          >
            <Input placeholder="1.2.3.4" />
          </Form.Item>

          <Form.Item
            label="Local Address"
            name="local_address"
            extra="Local VPN endpoint IP address (optional)"
          >
            <Input placeholder="5.6.7.8" />
          </Form.Item>

          <Form.Item
            label="Pre-shared Key"
            name="pre_shared_key"
            rules={[{ required: true, message: 'Please enter pre-shared key' }]}
          >
            <Input.Password placeholder="Pre-shared key" />
          </Form.Item>

          <Form.Item
            label="IKE Group"
            name="ike_group"
          >
            <InputNumber min={1} max={100} style={{ width: '100%' }} placeholder={14} />
          </Form.Item>

          <Form.Item
            label="ESP Group"
            name="esp_group"
          >
            <InputNumber min={1} max={100} style={{ width: '100%' }} placeholder={14} />
          </Form.Item>

          <Form.Item
            label="Description"
            name="description"
          >
            <Input placeholder="Description" />
          </Form.Item>
        </Form>
      </Modal>

      {/* OpenVPN Modal */}
      <Modal
        title="Add OpenVPN Instance"
        open={openvpnModalVisible}
        onOk={handleOpenvpnModalOk}
        onCancel={() => setOpenvpnModalVisible(false)}
        width={600}
        okText="Add"
        cancelText="Cancel"
      >
        <Form form={openvpnForm} layout="vertical">
          <Form.Item
            label="Instance Name"
            name="name"
            rules={[{ required: true, message: 'Please enter instance name' }]}
          >
            <Input placeholder="ovpn-server" />
          </Form.Item>

          <Form.Item
            label="Mode"
            name="mode"
          >
            <Select style={{ width: '100%' }}>
              <Select.Option value="server">Server</Select.Option>
              <Select.Option value="client">Client</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="Protocol"
            name="protocol"
          >
            <Select style={{ width: '100%' }}>
              <Select.Option value="udp">UDP</Select.Option>
              <Select.Option value="tcp">TCP</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="Port"
            name="port"
          >
            <InputNumber min={1} max={65535} style={{ width: '100%' }} placeholder={1194} />
          </Form.Item>

          <Form.Item
            label="Device"
            name="device"
          >
            <Input placeholder="tun0" />
          </Form.Item>

          <Form.Item
            label="Description"
            name="description"
          >
            <Input placeholder="Description" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
