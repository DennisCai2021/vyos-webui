/** Admin main page with tab navigation */

import { useState, useEffect } from 'react'
import {
  Card,
  Tabs,
  Typography,
  Row,
  Col,
  Statistic,
  Alert,
} from 'antd'
import {
  UserOutlined,
  TeamOutlined,
  LaptopOutlined,
  LockOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import { adminApi } from '../../api'
import UsersManagement from './UsersManagement'
import RolesManagement from './RolesManagement'
import SessionsManagement from './SessionsManagement'
import PasswordPolicy from './PasswordPolicy'

const { Title } = Typography

export default function Admin() {
  const [activeTab, setActiveTab] = useState('users')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalRoles: 0,
    activeSessions: 0,
  })

  const loadStats = async () => {
    setLoading(true)
    try {
      const [usersResponse, roles] = await Promise.all([
        adminApi.getUsers(1, 100),
        adminApi.getRoles(),
      ])

      const activeUsers = usersResponse.items.filter(u => ('is_active' in u && u.is_active) || ('enabled' in u && u.enabled) || true).length

      setStats({
        totalUsers: usersResponse.total,
        activeUsers,
        totalRoles: roles.length,
        activeSessions: 0,
      })
    } catch (error) {
      console.error('Failed to load stats:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStats()
  }, [])

  const handleTabChange = (key: string) => {
    setActiveTab(key)
  }

  const tabItems = [
    {
      key: 'users',
      label: (
        <span>
          <UserOutlined />
          Users
        </span>
      ),
      children: <UsersManagement />,
    },
    {
      key: 'roles',
      label: (
        <span>
          <TeamOutlined />
          Roles
        </span>
      ),
      children: <RolesManagement />,
    },
    {
      key: 'sessions',
      label: (
        <span>
          <LaptopOutlined />
          Sessions
        </span>
      ),
      children: <SessionsManagement />,
    },
    {
      key: 'policy',
      label: (
        <span>
          <LockOutlined />
          Password Policy
        </span>
      ),
      children: <PasswordPolicy />,
    },
  ]

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>
            Admin Management
          </Title>
          <Typography.Text type="secondary">
            Manage users, roles, permissions, and system security settings
          </Typography.Text>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false}>
            <Statistic
              title="Total Users"
              value={stats.totalUsers}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#1890ff' }}
              loading={loading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false}>
            <Statistic
              title="Active Users"
              value={stats.activeUsers}
              prefix={<UserAddOutlined />}
              valueStyle={{ color: '#52c41a' }}
              loading={loading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false}>
            <Statistic
              title="Roles"
              value={stats.totalRoles}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#722ed1' }}
              loading={loading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false}>
            <Statistic
              title="Active Sessions"
              value={stats.activeSessions}
              prefix={<LaptopOutlined />}
              valueStyle={{ color: '#fa8c16' }}
              loading={loading}
            />
          </Card>
        </Col>
      </Row>

      <Alert
        message="Security Notice"
        description="Only administrators should access this section. All actions are logged for security auditing."
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Card bordered={false}>
        <Tabs activeKey={activeTab} onChange={handleTabChange} items={tabItems} />
      </Card>
    </div>
  )
}
