/** Roles and permissions management component */

import { useState, useEffect } from 'react'
import {
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  message,
  Popconfirm,
  Tooltip,
  Typography,
  Card,
  Checkbox,
  Row,
  Col,
  Divider,
  Empty,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { adminApi } from '../../api'
import type { Role, Permission } from '../../types'

const { Title, Text } = Typography
const { TextArea } = Input

export default function RolesManagement() {
  const [loading, setLoading] = useState(false)
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])

  // Modal states
  const [roleModalVisible, setRoleModalVisible] = useState(false)
  const [viewModalVisible, setViewModalVisible] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [viewingRole, setViewingRole] = useState<Role | null>(null)

  const [form] = Form.useForm()

  const loadRoles = async () => {
    setLoading(true)
    try {
      const data = await adminApi.getRoles()
      setRoles(data)
    } catch (error) {
      message.error('Failed to load roles')
    } finally {
      setLoading(false)
    }
  }

  const loadPermissions = async () => {
    try {
      const data = await adminApi.getPermissions()
      setPermissions(data)
    } catch (error) {
      console.error('Failed to load permissions:', error)
    }
  }

  useEffect(() => {
    loadRoles()
    loadPermissions()
  }, [])

  const handleAddRole = () => {
    setEditingRole(null)
    form.resetFields()
    setRoleModalVisible(true)
  }

  const handleEditRole = (role: Role) => {
    setEditingRole(role)
    form.setFieldsValue({
      name: role.name,
      description: role.description,
      permission_ids: role.permissions?.map(p => p.id) || [],
    })
    setRoleModalVisible(true)
  }

  const handleViewRole = (role: Role) => {
    setViewingRole(role)
    setViewModalVisible(true)
  }

  const handleDeleteRole = async (role: Role) => {
    try {
      await adminApi.deleteRole(role.id)
      message.success(`Role ${role.name} deleted`)
      loadRoles()
    } catch (error) {
      message.error('Failed to delete role')
    }
  }

  const handleSubmitRole = async () => {
    try {
      const values = await form.validateFields()

      if (editingRole) {
        await adminApi.updateRole(editingRole.id, values)
        message.success('Role updated successfully')
      } else {
        await adminApi.createRole(values as any)
        message.success('Role created successfully')
      }

      setRoleModalVisible(false)
      loadRoles()
    } catch (error) {
      console.error('Failed to save role:', error)
    }
  }

  // Group permissions by resource
  const groupedPermissions = permissions.reduce((acc, perm) => {
    if (!acc[perm.resource]) {
      acc[perm.resource] = []
    }
    acc[perm.resource].push(perm)
    return acc
  }, {} as Record<string, Permission[]>)

  const columns: ColumnsType<Role> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (name: string) => (
        <Space>
          <SafetyCertificateOutlined />
          <Text strong style={{ textTransform: 'capitalize' }}>{name}</Text>
        </Space>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (desc?: string) => desc || '-',
    },
    {
      title: 'Permissions',
      key: 'permissions_count',
      width: 120,
      render: (_: any, record: Role) => (
        <Tag color="blue">{record.permissions?.length || 0} permissions</Tag>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (date: string) => new Date(date).toLocaleDateString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_: any, record: Role) => (
        <Space size="small">
          <Tooltip title="View">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewRole(record)}
            />
          </Tooltip>
          <Tooltip title="Edit">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEditRole(record)}
            />
          </Tooltip>
          {record.name !== 'superadmin' && (
            <Popconfirm
              title="Delete Role"
              description={`Are you sure you want to delete role "${record.name}"?`}
              onConfirm={() => handleDeleteRole(record)}
              okText="Yes"
              cancelText="No"
            >
              <Tooltip title="Delete">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadRoles} loading={loading}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddRole}>
            Add Role
          </Button>
        </Space>
      </div>

      <Card style={{ minHeight: 400 }}>
        <Table
          columns={columns}
          dataSource={roles}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} roles`,
          }}
          scroll={{ x: 800 }}
          locale={{
            emptyText: <Empty description="No roles found" />,
          }}
        />
      </Card>

      {/* Role Modal */}
      <Modal
        title={editingRole ? 'Edit Role' : 'Add Role'}
        open={roleModalVisible}
        onOk={handleSubmitRole}
        onCancel={() => setRoleModalVisible(false)}
        okText="Save"
        cancelText="Cancel"
        width={700}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Role Name"
            rules={[{ required: true, message: 'Please enter role name' }]}
          >
            <Input disabled={!!editingRole} placeholder="Enter role name" />
          </Form.Item>

          <Form.Item name="description" label="Description">
            <TextArea rows={3} placeholder="Enter role description" />
          </Form.Item>

          <Divider />

          <Form.Item name="permission_ids" label="Permissions">
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {Object.entries(groupedPermissions).map(([resource, perms]) => (
                <div key={resource} style={{ marginBottom: 16 }}>
                  <Title level={5} style={{ marginBottom: 8, textTransform: 'capitalize' }}>
                    {resource}
                  </Title>
                  <Checkbox.Group>
                    <Row gutter={[16, 8]}>
                      {perms.map(perm => (
                        <Col span={12} key={perm.id}>
                          <Checkbox value={perm.id}>
                            {perm.name}
                            <Text type="secondary" style={{ fontSize: '12px', display: 'block' }}>
                              {perm.code}
                            </Text>
                          </Checkbox>
                        </Col>
                      ))}
                    </Row>
                  </Checkbox.Group>
                </div>
              ))}
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* View Role Modal */}
      <Modal
        title="Role Details"
        open={viewModalVisible}
        onCancel={() => setViewModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setViewModalVisible(false)}>
            Close
          </Button>,
        ]}
        width={600}
      >
        {viewingRole && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ fontSize: 16 }}>
                {viewingRole.name}
              </Text>
              <br />
              <Text type="secondary">{viewingRole.description}</Text>
            </div>

            <Divider />

            <Title level={5}>Permissions</Title>
            {viewingRole.permissions?.length ? (
              <Space wrap>
                {viewingRole.permissions.map(perm => (
                  <Tag key={perm.id} color="blue">
                    {perm.name}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Text type="secondary">No permissions assigned</Text>
            )}

            <Divider />

            <Row gutter={16}>
              <Col span={12}>
                <Text type="secondary">Created:</Text>
                <br />
                {new Date(viewingRole.created_at).toLocaleString()}
              </Col>
              <Col span={12}>
                <Text type="secondary">Updated:</Text>
                <br />
                {new Date(viewingRole.updated_at).toLocaleString()}
              </Col>
            </Row>
          </div>
        )}
      </Modal>
    </div>
  )
}
