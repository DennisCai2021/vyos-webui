import { useState, useEffect } from 'react'
import {
  Card,
  Button,
  Typography,
  Form,
  Input,
  Switch,
  Space,
  message,
  Divider,
  Alert,
  Tag,
  Tooltip,
} from 'antd'
import {
  SaveOutlined,
  ReloadOutlined,
  PlusOutlined,
  DeleteOutlined,
  GlobalOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import type { DNSConfig } from '../../api/types'
import { networkApi } from '../../api'

const { Title, Text } = Typography

interface NameserverInput {
  id: number
  value: string
}

export default function DNS() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, setDnsConfig] = useState<DNSConfig | null>(null)
  const [nameservers, setNameservers] = useState<NameserverInput[]>([])
  const [searchDomains, setSearchDomains] = useState<string[]>([])
  const [forwarders, setForwarders] = useState<string[]>([])
  const [form] = Form.useForm()

  const loadDNSConfig = async () => {
    setLoading(true)
    setError(null)
    try {
      const config = await networkApi.getDNSConfig()
      setDnsConfig(config)

      // Convert nameservers to input items
      const nsInputs = config.nameservers.map((ns, idx) => ({ id: idx, value: ns }))
      setNameservers(nsInputs)
      setSearchDomains(config.search_domains || [])
      setForwarders(config.forwarders || [])

      form.setFieldsValue({
        caching: config.caching,
        listening_address: config.listening_address || '0.0.0.0',
      })
    } catch (error: any) {
      console.error('Failed to load DNS config:', error)
      const errorMsg = error.message || 'Failed to load DNS configuration from VyOS device'
      setError(errorMsg)
      message.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDNSConfig()
  }, [])

  const handleSave = async () => {
    setLoading(true)
    const hide = message.loading('正在保存 DNS 配置...', 0)
    try {
      await form.validateFields()
      const nameserverList = nameservers.map((ns) => ns.value).filter((v) => v.trim())

      // Call API to save DNS config
      await networkApi.updateDNSConfig({
        nameservers: nameserverList,
      })

      hide()
      message.success('DNS 配置保存成功！')
      loadDNSConfig()
    } catch (error: any) {
      hide()
      console.error('Failed to save DNS config:', error)
      const errorMsg = error.message || 'Failed to save DNS configuration'
      message.error(`保存失败: ${errorMsg}`)
    } finally {
      setLoading(false)
    }
  }

  const addNameserver = () => {
    const newId = nameservers.length > 0 ? Math.max(...nameservers.map((n) => n.id)) + 1 : 0
    setNameservers([...nameservers, { id: newId, value: '' }])
  }

  const removeNameserver = (id: number) => {
    setNameservers(nameservers.filter((ns) => ns.id !== id))
  }

  const updateNameserver = (id: number, value: string) => {
    setNameservers(nameservers.map((ns) => (ns.id === id ? { ...ns, value } : ns)))
  }

  const addSearchDomain = () => {
    setSearchDomains([...searchDomains, ''])
  }

  const removeSearchDomain = (index: number) => {
    setSearchDomains(searchDomains.filter((_, idx) => idx !== index))
  }

  const updateSearchDomain = (index: number, value: string) => {
    setSearchDomains(searchDomains.map((sd, idx) => (idx === index ? value : sd)))
  }

  const addForwarder = () => {
    setForwarders([...forwarders, ''])
  }

  const removeForwarder = (index: number) => {
    setForwarders(forwarders.filter((_, idx) => idx !== index))
  }

  const updateForwarder = (index: number, value: string) => {
    setForwarders(forwarders.map((f, idx) => (idx === index ? value : f)))
  }

  const validateIPAddress = (_: any, value: string) => {
    if (!value || !value.trim()) {
      return Promise.resolve()
    }
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
    if (!ipRegex.test(value.trim())) {
      return Promise.reject(new Error('Invalid IP address format'))
    }
    const parts = value.trim().split('.')
    if (parts.some((part) => parseInt(part) > 255)) {
      return Promise.reject(new Error('Invalid IP address'))
    }
    return Promise.resolve()
  }

  const validateDomain = (_: any, value: string) => {
    if (!value || !value.trim()) {
      return Promise.resolve()
    }
    const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i
    if (!domainRegex.test(value.trim())) {
      return Promise.reject(new Error('Invalid domain name'))
    }
    return Promise.resolve()
  }

  return (
    <div>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={2} style={{ margin: 0 }}>
              DNS Configuration
            </Title>
            <Text type="secondary">Configure DNS resolver settings</Text>
          </div>
          <Space>
            <Button
              type="default"
              icon={<ReloadOutlined />}
              onClick={loadDNSConfig}
              loading={loading}
            >
              Refresh
            </Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={loading}>
              Save Configuration
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
              <Button size="small" danger onClick={loadDNSConfig}>
                Retry
              </Button>
            }
          />
        )}

        <Alert
          message="DNS Configuration"
          description="Configure the DNS resolver used by this VyOS router. Changes will take effect immediately after saving."
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
        />

        <Form form={form} layout="vertical">
          {/* System Nameservers */}
          <Card title="System Nameservers" bordered={false} style={{ marginBottom: 16 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              Configure the DNS servers that this router will use for name resolution.
              These are the servers queried when resolving domain names.
            </Text>
            <Space direction="vertical" style={{ width: '100%' }}>
              {nameservers.map((ns, idx) => (
                <Space key={ns.id} style={{ width: '100%' }}>
                  <Form.Item
                    style={{ marginBottom: 0, flex: 1 }}
                    rules={[{ validator: validateIPAddress }]}
                    validateTrigger="onBlur"
                  >
                    <Input
                      placeholder="e.g., 8.8.8.8"
                      value={ns.value}
                      onChange={(e) => updateNameserver(ns.id, e.target.value)}
                      suffix={idx === 0 && <Tag color="green">Primary</Tag>}
                    />
                  </Form.Item>
                  {nameservers.length > 1 && (
                    <Tooltip title="Remove nameserver">
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => removeNameserver(ns.id)}
                      />
                    </Tooltip>
                  )}
                </Space>
              ))}
              <Button
                type="dashed"
                block
                icon={<PlusOutlined />}
                onClick={addNameserver}
              >
                Add Nameserver
              </Button>
            </Space>
          </Card>

          {/* DNS Forwarding/Caching */}
          <Card title="DNS Forwarding" bordered={false} style={{ marginBottom: 16 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              Enable DNS forwarding to allow LAN clients to use this router as their DNS server.
              The router will cache responses for improved performance.
            </Text>

            <Form.Item
              label="Enable DNS Caching"
              name="caching"
              valuePropName="checked"
              tooltip="Enable the DNS caching/forwarding service"
            >
              <Switch
                checkedChildren={<CheckCircleOutlined />}
                unCheckedChildren={<GlobalOutlined />}
              />
            </Form.Item>

            <Form.Item
              label="Listening Address"
              name="listening_address"
              extra="The address on which the DNS service will listen (0.0.0.0 = all interfaces)"
            >
              <Input placeholder="0.0.0.0" />
            </Form.Item>

            <Divider />

            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              DNS Forwarders are additional DNS servers that will be queried by this router when
              it cannot resolve a domain from its cache.
            </Text>
            <Space direction="vertical" style={{ width: '100%' }}>
              {forwarders.map((fw, idx) => (
                <Space key={idx} style={{ width: '100%' }}>
                  <Form.Item
                    style={{ marginBottom: 0, flex: 1 }}
                    rules={[{ validator: validateIPAddress }]}
                    validateTrigger="onBlur"
                  >
                    <Input
                      placeholder="e.g., 1.1.1.1"
                      value={fw}
                      onChange={(e) => updateForwarder(idx, e.target.value)}
                    />
                  </Form.Item>
                  <Tooltip title="Remove forwarder">
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeForwarder(idx)}
                    />
                  </Tooltip>
                </Space>
              ))}
              <Button
                type="dashed"
                block
                icon={<PlusOutlined />}
                onClick={addForwarder}
              >
                Add DNS Forwarder
              </Button>
            </Space>
          </Card>

          {/* Search Domains */}
          <Card title="Search Domains" bordered={false}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              Search domains are automatically appended to unqualified hostnames during DNS queries.
              These are useful for local network resolution.
            </Text>
            <Space direction="vertical" style={{ width: '100%' }}>
              {searchDomains.map((sd, idx) => (
                <Space key={idx} style={{ width: '100%' }}>
                  <Form.Item
                    style={{ marginBottom: 0, flex: 1 }}
                    rules={[{ validator: validateDomain }]}
                    validateTrigger="onBlur"
                  >
                    <Input
                      placeholder="e.g., local"
                      value={sd}
                      onChange={(e) => updateSearchDomain(idx, e.target.value)}
                    />
                  </Form.Item>
                  <Tooltip title="Remove search domain">
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeSearchDomain(idx)}
                    />
                  </Tooltip>
                </Space>
              ))}
              <Button
                type="dashed"
                block
                icon={<PlusOutlined />}
                onClick={addSearchDomain}
              >
                Add Search Domain
              </Button>
            </Space>
          </Card>
        </Form>
      </Space>
    </div>
  )
}
