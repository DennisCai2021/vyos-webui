import { Layout, Button, Dropdown, Space, Badge } from 'antd'
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
import { useTheme, useAuth } from '../../contexts'

const { Header: HeaderLayout } = Layout

interface HeaderProps {
  collapsed: boolean
  onCollapse: () => void
}

export function HeaderComponent({ collapsed, onCollapse }: HeaderProps) {
  const { theme, toggleMode } = useTheme()
  const { user } = useAuth()

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
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <PoweroffOutlined />,
      label: 'Logout',
      danger: true,
    },
  ]

  return (
    <HeaderLayout style={{ padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div className="header-left">
        <Button
          type="text"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onCollapse}
        />
      </div>

      <div className="header-right">
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
    </HeaderLayout>
  )
}
