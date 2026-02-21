/** Backup & Restore page */

import { useState, useEffect } from 'react'
import {
  Card,
  Row,
  Col,
  Button,
  Table,
  Space,
  Modal,
  Form,
  Input,
  Upload,
  message,
  Tag,
  Popconfirm,
  Progress,
  Alert,
  Typography,
  Divider,
  Descriptions,
} from 'antd'
import {
  CloudUploadOutlined,
  CloudDownloadOutlined,
  ReloadOutlined,
  DeleteOutlined,
  EyeOutlined,
  SwapOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import type { UploadProps } from 'antd'
import type { RcFile } from 'antd/es/upload'

const { Title, Text } = Typography

interface Backup {
  id: string
  name: string
  createdAt: string
  size: number
  description?: string
  version: string
}

export default function BackupRestore() {
  const [loading, setLoading] = useState(false)
  const [backups, setBackups] = useState<Backup[]>([])
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [restoreModalVisible, setRestoreModalVisible] = useState(false)
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null)
  const [compareModalVisible, setCompareModalVisible] = useState(false)
  const [backupProgress, setBackupProgress] = useState(0)
  const [form] = Form.useForm()

  const loadBackups = async () => {
    setLoading(true)
    try {
      setBackups([
        {
          id: '1',
          name: 'backup-20260214-1',
          createdAt: '2026-02-14T10:30:00Z',
          size: 102400,
          description: 'Daily backup',
          version: '1.4.2',
        },
        {
          id: '2',
          name: 'backup-20260213-1',
          createdAt: '2026-02-13T10:30:00Z',
          size: 101800,
          description: 'Before firewall changes',
          version: '1.4.2',
        },
        {
          id: '3',
          name: 'backup-20260212-1',
          createdAt: '2026-02-12T10:30:00Z',
          size: 101500,
          description: 'Weekly backup',
          version: '1.4.2',
        },
      ])
    } catch (error) {
      console.error('Failed to load backups:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBackups()
  }, [])

  const handleCreateBackup = async () => {
    setBackupProgress(0)
    const interval = setInterval(() => {
      setBackupProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          message.success('Backup created successfully')
          setCreateModalVisible(false)
          loadBackups()
          return 100
        }
        return prev + 10
      })
    }, 200)
  }

  const handleRestoreBackup = async () => {
    Modal.confirm({
      title: 'Confirm Restore',
      content: 'Restoring a backup will overwrite current configuration. This action cannot be undone. Continue?',
      okText: 'Restore',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: () => {
        message.success('Configuration restored successfully')
        setRestoreModalVisible(false)
      },
    })
  }

  const handleDeleteBackup = (backup: Backup) => {
    setBackups(prev => prev.filter(b => b.id !== backup.id))
    message.success('Backup deleted')
  }

  const handleDownloadBackup = (backup: Backup) => {
    message.info(`Downloading ${backup.name}...`)
  }

  const uploadProps: UploadProps = {
    beforeUpload: (file: RcFile) => {
      const isConfig = file.name.endsWith('.conf') || file.name.endsWith('.json') || file.name.endsWith('.tar.gz')
      if (!isConfig) {
        message.error('You can only upload .conf, .json, or .tar.gz files!')
      }
      return isConfig || Upload.LIST_IGNORE
    },
    onChange: (info) => {
      if (info.file.status === 'done') {
        message.success(`${info.file.name} file uploaded successfully`)
      } else if (info.file.status === 'error') {
        message.error(`${info.file.name} file upload failed.`)
      }
    },
  }

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: 'Created At',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: 'Version',
      dataIndex: 'version',
      key: 'version',
      render: (version: string) => <Tag color="blue">{version}</Tag>,
    },
    {
      title: 'Size',
      dataIndex: 'size',
      key: 'size',
      render: (size: number) => `${(size / 1024).toFixed(2)} KB`,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: Backup) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedBackup(record)
              setCompareModalVisible(true)
            }}
          >
            Compare
          </Button>
          <Button
            type="link"
            size="small"
            icon={<CloudDownloadOutlined />}
            onClick={() => handleDownloadBackup(record)}
          >
            Download
          </Button>
          <Button
            type="link"
            size="small"
            icon={<SwapOutlined />}
            onClick={() => {
              setSelectedBackup(record)
              setRestoreModalVisible(true)
            }}
          >
            Restore
          </Button>
          <Popconfirm
            title="Delete this backup?"
            onConfirm={() => handleDeleteBackup(record)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Create Backup">
            <Alert
              message="Backup current configuration"
              description="Create a backup of the current VyOS configuration"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                size="large"
                block
                onClick={() => setCreateModalVisible(true)}
              >
                Create Backup Now
              </Button>
              <Divider />
              <Title level={5}>Schedule</Title>
              <Text type="secondary">
                Auto-backup is configured to run daily at 02:00 UTC
              </Text>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Restore Configuration">
            <Alert
              message="Restore from file"
              description="Upload and restore a configuration file"
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Space direction="vertical" style={{ width: '100%' }}>
              <Upload {...uploadProps} showUploadList={false}>
                <Button icon={<CloudUploadOutlined />} block>
                  Upload Configuration File
                </Button>
              </Upload>
              <Divider />
              <Text type="secondary">
                Supported formats: .conf, .json, .tar.gz
              </Text>
            </Space>
          </Card>
        </Col>
      </Row>

      <Card
        title="Backup History"
        extra={
          <Button icon={<ReloadOutlined />} onClick={loadBackups} loading={loading}>
            Refresh
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={backups}
          rowKey="id"
          loading={loading}
        />
      </Card>

      <Modal
        title="Create Backup"
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateBackup}>
          <Form.Item label="Backup Name" name="name" initialValue={`backup-${new Date().toISOString().slice(0, 10)}`}>
            <Input />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea rows={3} placeholder="Enter a description for this backup..." />
          </Form.Item>
          {backupProgress > 0 && (
            <Form.Item>
              <Progress percent={backupProgress} status="active" />
            </Form.Item>
          )}
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" disabled={backupProgress > 0 && backupProgress < 100}>
                Create Backup
              </Button>
              <Button onClick={() => setCreateModalVisible(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Restore Configuration"
        open={restoreModalVisible}
        onCancel={() => setRestoreModalVisible(false)}
        footer={null}
      >
        {selectedBackup && (
          <>
            <Alert
              message="Warning"
              description="This will overwrite your current configuration!"
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Backup Name">{selectedBackup.name}</Descriptions.Item>
              <Descriptions.Item label="Created At">
                {new Date(selectedBackup.createdAt).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="Version">{selectedBackup.version}</Descriptions.Item>
              <Descriptions.Item label="Size">{(selectedBackup.size / 1024).toFixed(2)} KB</Descriptions.Item>
              <Descriptions.Item label="Description">{selectedBackup.description || '-'}</Descriptions.Item>
            </Descriptions>
            <Divider />
            <Space>
              <Button type="primary" danger onClick={handleRestoreBackup}>
                Restore Configuration
              </Button>
              <Button onClick={() => setRestoreModalVisible(false)}>Cancel</Button>
            </Space>
          </>
        )}
      </Modal>

      <Modal
        title="Compare Configuration"
        open={compareModalVisible}
        onCancel={() => setCompareModalVisible(false)}
        width={800}
        footer={[
          <Button key="close" onClick={() => setCompareModalVisible(false)}>
            Close
          </Button>,
        ]}
      >
        <Alert
          message="Configuration Comparison"
          description="Showing differences between current configuration and backup"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Card type="inner" title="Differences">
          <pre style={{
            background: '#1e1e1e',
            padding: 16,
            borderRadius: 4,
            overflow: 'auto',
            maxHeight: 400,
          }}>
            <Text type="success">+ set interfaces ethernet eth0 address 192.168.1.1/24</Text>
            {'\n'}
            <Text type="danger">- set interfaces ethernet eth0 address 192.168.0.1/24</Text>
            {'\n'}
            <Text>  set system host-name vyos-router</Text>
          </pre>
        </Card>
      </Modal>
    </div>
  )
}
