/** Top bar component with user menu and logout functionality */

import React, { useCallback } from 'react'
import { Layout, Button, Dropdown, Space, Badge, Modal, Form, Input, message } from 'antd'
import type { MenuProps } from 'antd'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SunOutlined,
  MoonOutlined,
  BellOutlined,
  UserOutlined,
  LockOutlined,
  PoweroffOutlined,
} from '@ant-design/icons'
import { useTheme, useAuth, useI18n } from '../../contexts'

const { Header } = Layout

interface TopBarProps {
  collapsed: boolean
  onCollapse: () => void
}

const TopBar: React.FC<TopBarProps> = ({ collapsed, onCollapse }) => {
  const { theme, toggleMode } = useTheme()
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const [passwordForm] = Form.useForm()

  const handleLogout = useCallback(() => {
    Modal.confirm({
      title: t('common.confirm'),
      content: t('auth.logout'),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: () => {
        logout()
        message.success(t('auth.logoutSuccess'))
      },
    })
  }, [logout, t])

  const handleChangePassword = useCallback(() => {
    passwordForm.resetFields()

    Modal.confirm({
      title: t('common.edit') + ' ' + t('login.password'),
      content: (
        <Form
          form={passwordForm}
          layout="vertical"
        >
          <Form.Item
            name="currentPassword"
            label={t('login.password')}
            rules={[{ required: true }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label={t('login.password') + ' (New)'}
            rules={[{ required: true, min: 8 }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label={t('login.password') + ' (Confirm)'}
            dependencies={['newPassword']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('Passwords do not match'))
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      ),
      okText: t('common.submit'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await passwordForm.validateFields()
          // TODO: Call API to change password
          message.success(t('common.success'))
        } catch {
          // Form validation failed
        }
      },
    })
  }, [passwordForm, t])

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Profile',
    },
    {
      key: 'change-password',
      icon: <LockOutlined />,
      label: 'Change Password',
      onClick: handleChangePassword,
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <PoweroffOutlined />,
      label: t('auth.logout'),
      danger: true,
      onClick: handleLogout,
    },
  ]

  return (
    <Header className="topbar">
      <div className="topbar-left">
        <Button
          type="text"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onCollapse}
          className="collapse-btn"
        />
      </div>

      <div className="topbar-right">
        <Space size="middle">
          {/* Theme Toggle */}
          <Button
            type="text"
            icon={theme.mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
            onClick={toggleMode}
            title={theme.mode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          />

          {/* Notifications */}
          <Badge count={0} overflowCount={10}>
            <Button type="text" icon={<BellOutlined />} />
          </Badge>

          {/* User Menu */}
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <Button type="text">
              <Space>
                <UserOutlined />
                <span>{user?.username || 'User'}</span>
              </Space>
            </Button>
          </Dropdown>
        </Space>
      </div>
    </Header>
  )
}

export default TopBar
