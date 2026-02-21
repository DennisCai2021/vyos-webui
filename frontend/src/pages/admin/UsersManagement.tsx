/** Users management component */

import { useState, useEffect } from 'react'
import {
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  Switch,
  Select,
  message,
  Popconfirm,
  Tooltip,
  Typography,
  Card,
  Empty,
  Alert,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  LockOutlined,
  ReloadOutlined,
  UserOutlined,
  SearchOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { adminApi } from '../../api'

const { Text } = Typography
const { Option } = Select
const { Search } = Input

// Simple user interface that matches what the API returns
interface SimpleUser {
  id: number
  username: string
  full_name?: string
  email?: string
  roles: string[]
  is_active?: boolean
  enabled?: boolean
  created_at?: string
  mfa_enabled?: boolean
  mfa_method?: string
  last_login?: string
}

interface SimpleRole {
  id: number
  name: string
  description?: string
  permissions: any[]
}

interface UsersManagementProps {
  onUserChange?: () => void
}

export default function UsersManagement({ onUserChange }: UsersManagementProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [users, setUsers] = useState<SimpleUser[]>([])
  const [roles, setRoles] = useState<SimpleRole[]>([])
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [searchText, setSearchText] = useState('')

  // Modal states
  const [userModalVisible, setUserModalVisible] = useState(false)
  const [passwordModalVisible, setPasswordModalVisible] = useState(false)
  const [editingUser, setEditingUser] = useState<SimpleUser | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)

  const [form] = Form.useForm()
  const [passwordForm] = Form.useForm()

  const loadUsers = async (page = 1, pageSize = 20) => {
    setLoading(true)
    setError(null)
    try {
      const response = await adminApi.getUsers(page, pageSize)
      // Transform users to match SimpleUser interface with type assertion
      const transformedUsers = response.items.map(u => ({
        ...u,
        is_active: (('is_active' in u) ? u.is_active : ('enabled' in u) ? u.enabled : true) as boolean,
        created_at: (('created_at' in u) ? u.created_at : new Date().toISOString()) as string,
      }))
      setUsers(transformedUsers as SimpleUser[])
      setPagination({
        current: response.page,
        pageSize: response.page_size,
        total: response.total,
      })
    } catch (error: any) {
      console.error('Failed to load users:', error)
      const errorMsg = error.message || 'Failed to load users'
      setError(errorMsg)
      message.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const loadRoles = async () => {
    try {
      const data = await adminApi.getRoles()
      // Transform roles to match SimpleRole interface with type assertion
      const transformedRoles = data.map(r => ({
        ...r,
        permissions: (Array.isArray(r.permissions) ? r.permissions : []) as any[],
      }))
      setRoles(transformedRoles as SimpleRole[])
    } catch (error: any) {
      console.error('Failed to load roles:', error)
    }
  }

  useEffect(() => {
    loadUsers()
    loadRoles()
  }, [])

  const handleAddUser = () => {
    setEditingUser(null)
    form.resetFields()
    form.setFieldsValue({ is_active: true })
    setUserModalVisible(true)
  }

  const handleEditUser = (user: SimpleUser) => {
    setEditingUser(user)
    form.setFieldsValue({
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      is_active: user.is_active ?? user.enabled ?? true,
      roles: user.roles,
    })
    setUserModalVisible(true)
  }

  const handleToggleActive = async (user: SimpleUser, checked: boolean) => {
    try {
      await adminApi.toggleUserActive(user.username, checked)
      setUsers(users.map(u => u.id === user.id ? { ...u, is_active: checked } : u))
      message.success(`User ${user.username} ${checked ? 'enabled' : 'disabled'}`)
      onUserChange?.()
    } catch (error: any) {
      message.error(error.message || 'Failed to update user status')
    }
  }

  const handleDeleteUser = async (user: SimpleUser) => {
    try {
      await adminApi.deleteUser(user.username)
      setUsers(users.filter(u => u.id !== user.id))
      message.success(`User ${user.username} deleted`)
      onUserChange?.()
    } catch (error: any) {
      message.error(error.message || 'Failed to delete user')
    }
  }

  const handleResetPassword = (user: SimpleUser) => {
    setSelectedUserId(user.id)
    passwordForm.resetFields()
    setPasswordModalVisible(true)
  }

  const handleSubmitPassword = async () => {
    if (!selectedUserId) return

    try {
      await passwordForm.validateFields()
      const user = users.find(u => u.id === selectedUserId)
      if (user) {
        // Note: Password reset is not directly supported by backend API
        message.info('Password reset requires manual configuration')
      }
      setPasswordModalVisible(false)
    } catch (error: any) {
      message.error(error.message || 'Failed to reset password')
    }
  }

  const handleSubmitUser = async () => {
    try {
      const values = await form.validateFields()

      if (editingUser) {
        // Update existing user
        await adminApi.updateUser(editingUser.username, {
          full_name: values.full_name,
          email: values.email,
          roles: values.roles,
          enabled: values.is_active,
        })
        message.success(`User ${editingUser.username} updated`)
      } else {
        // Create new user
        await adminApi.createUser({
          username: values.username,
          full_name: values.full_name,
          email: values.email,
          password: values.password,
          roles: values.roles || ['user'],
        })
        message.success(`User ${values.username} created`)
      }

      setUserModalVisible(false)
      loadUsers(pagination.current, pagination.pageSize)
      onUserChange?.()
    } catch (error: any) {
      message.error(error.message || 'Failed to save user')
      console.error('Failed to save user:', error)
    }
  }

  const filteredUsers = users.filter(user =>
    user.username.toLowerCase().includes(searchText.toLowerCase()) ||
    (user.email?.toLowerCase().includes(searchText.toLowerCase()) || false) ||
    (user.full_name?.toLowerCase().includes(searchText.toLowerCase()) || false)
  )

  const columns: ColumnsType<SimpleUser> = [
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
      width: 150,
      render: (username: string) => (
        <Space>
          <UserOutlined />
          <Text strong>{username}</Text>
        </Space>
      ),
    },
    {
      title: 'Full Name',
      dataIndex: 'full_name',
      key: 'full_name',
      width: 150,
      render: (name?: string) => name || '-',
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 200,
      render: (email?: string) => email || '-',
    },
    {
      title: 'Roles',
      key: 'roles',
      width: 150,
      render: (_: any, record: SimpleUser) => (
        <Space wrap size="small">
          {record.roles?.map((role, idx) => (
            <Tag key={idx} color="blue">
              {role}
            </Tag>
          )) || '-'}
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 100,
      render: (isActive: boolean, _record: SimpleUser) => (
        <Switch
          checked={isActive}
          onChange={(checked) => handleToggleActive(_record, checked)}
          checkedChildren="Active"
          unCheckedChildren="Inactive"
        />
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
      width: 180,
      fixed: 'right',
      render: (_: any, record: SimpleUser) => (
        <Space size="small">
          <Tooltip title="Edit">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEditUser(record)}
            />
          </Tooltip>
          <Tooltip title="Reset Password">
            <Button
              type="text"
              size="small"
              icon={<LockOutlined />}
              onClick={() => handleResetPassword(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete User"
            description={`Are you sure you want to delete user "${record.username}"?`}
            onConfirm={() => handleDeleteUser(record)}
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
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Search
          placeholder="Search users..."
          allowClear
          style={{ width: 300 }}
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => loadUsers(pagination.current, pagination.pageSize)} loading={loading}>
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddUser}>
            Add User
          </Button>
        </Space>
      </div>

      {error && (
        <Alert
          message="Error Loading Users"
          description={error}
          type="error"
          showIcon
          icon={<WarningOutlined />}
          closable
          onClose={() => setError(null)}
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" danger onClick={() => loadUsers()}>
              Retry
            </Button>
          }
        />
      )}

      <Card style={{ minHeight: 400 }}>
        <Table
          columns={columns}
          dataSource={filteredUsers}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `Total ${total} users`,
            onChange: (page, pageSize) => loadUsers(page, pageSize),
          }}
          scroll={{ x: 1000 }}
          locale={{
            emptyText: <Empty description="No users found" />,
          }}
        />
      </Card>

      {/* User Modal */}
      <Modal
        title={editingUser ? 'Edit User' : 'Add User'}
        open={userModalVisible}
        onOk={handleSubmitUser}
        onCancel={() => setUserModalVisible(false)}
        okText="Save"
        cancelText="Cancel"
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="username"
            label="Username"
            rules={[{ required: true, message: 'Please enter username' }]}
          >
            <Input disabled={!!editingUser} placeholder="Enter username" />
          </Form.Item>

          {!editingUser && (
            <Form.Item
              name="password"
              label="Password"
              rules={[
                { required: true, message: 'Please enter password' },
                { min: 8, message: 'Password must be at least 8 characters' },
              ]}
            >
              <Input.Password placeholder="Enter password" />
            </Form.Item>
          )}

          <Form.Item name="full_name" label="Full Name">
            <Input placeholder="Enter full name" />
          </Form.Item>

          <Form.Item
            name="email"
            label="Email"
            rules={[{ type: 'email', message: 'Please enter valid email' }]}
          >
            <Input placeholder="Enter email address" />
          </Form.Item>

          <Form.Item name="roles" label="Roles">
            <Select mode="multiple" placeholder="Select roles">
              {roles.map(role => (
                <Option key={role.id} value={role.name}>
                  {role.name} - {role.description}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="is_active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Password Reset Modal */}
      <Modal
        title="Reset Password"
        open={passwordModalVisible}
        onOk={handleSubmitPassword}
        onCancel={() => setPasswordModalVisible(false)}
        okText="Reset"
        cancelText="Cancel"
      >
        <Form form={passwordForm} layout="vertical">
          <Form.Item
            name="password"
            label="New Password"
            rules={[
              { required: true, message: 'Please enter new password' },
              { min: 8, message: 'Password must be at least 8 characters' },
            ]}
          >
            <Input.Password placeholder="Enter new password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="Confirm Password"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Please confirm password' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('Passwords do not match'))
                },
              }),
            ]}
          >
            <Input.Password placeholder="Confirm new password" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
