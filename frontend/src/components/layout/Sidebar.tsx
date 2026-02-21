import { Menu, Layout, Button, Drawer } from 'antd'
import {
  SettingOutlined,
  UserOutlined,
  SafetyOutlined,
  GlobalOutlined,
  DashboardOutlined,
  LogoutOutlined,
  QuestionCircleOutlined,
  SwapOutlined,
  ApiOutlined,
  WifiOutlined,
  GatewayOutlined,
  CloudServerOutlined,
  FilterOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { useState } from 'react'
import { useAuth } from '../../contexts'

const { Sider } = Layout

// Map child keys to their parent keys
const parentKeyMap: Record<string, string> = {
  'network-interfaces': 'interfaces',
  'network-vlan': 'interfaces',
  'network-pppoe': 'interfaces',
  'network-routes': 'routing',
  'network-route-summary': 'routing',
  'network-bgp': 'routing',
  'network-isis': 'routing',
  'network-dns': 'services',
  'network-arp': 'system',
  'system-info': 'system',
  'system-logs': 'system',
  'system-backup': 'system',
  'system-monitoring': 'system',
  'admin-users': 'admin',
  'admin-settings': 'admin',
  'policy-prefix-list': 'policy',
  'policy-route-map': 'policy',
  'policy-community-list': 'policy',
}

export function Sidebar({ collapsed, onCollapse, isMobile }: SidebarProps) {
  const { logout } = useAuth()

  // Initialize from URL hash
  const getInitialState = () => {
    const hash = window.location.hash.slice(1) || 'dashboard'
    const parentKey = parentKeyMap[hash]
    return {
      selectedKey: hash,
      openKeys: parentKey ? [parentKey] : []
    }
  }

  const initialState = getInitialState()
  const [selectedKey, setSelectedKey] = useState(initialState.selectedKey)
  const [openKeys, setOpenKeys] = useState(initialState.openKeys)

  const menuItems: MenuProps['items'] = [
    {
      key: 'dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
    },
    {
      key: 'interfaces',
      icon: <WifiOutlined />,
      label: 'Interfaces',
      children: [
        { key: 'network-interfaces', label: 'Interfaces' },
        { key: 'network-vlan', label: 'VLAN' },
        { key: 'network-pppoe', label: 'PPPoE' },
      ],
    },
    {
      key: 'firewall',
      icon: <SafetyOutlined />,
      label: 'Firewall',
    },
    {
      key: 'nat',
      icon: <SwapOutlined />,
      label: 'NAT',
    },
    {
      key: 'vpn',
      icon: <CloudServerOutlined />,
      label: 'VPN',
    },
    {
      key: 'routing',
      icon: <GatewayOutlined />,
      label: 'Routing',
      children: [
        { key: 'network-routes', label: 'Static Routes' },
        { key: 'network-route-summary', label: 'Routing Summary' },
        { key: 'network-bgp', label: 'BGP' },
        { key: 'network-isis', label: 'IS-IS' },
      ],
    },
    {
      key: 'policy',
      icon: <FilterOutlined />,
      label: 'Policy',
      children: [
        { key: 'policy-prefix-list', label: 'Prefix Lists' },
        { key: 'policy-route-map', label: 'Route Maps' },
        { key: 'policy-community-list', label: 'Community Lists' },
      ],
    },
    {
      key: 'services',
      icon: <ApiOutlined />,
      label: 'Services',
      children: [
        { key: 'network-dns', label: 'DNS' },
      ],
    },
    {
      key: 'system',
      icon: <SettingOutlined />,
      label: 'System',
      children: [
        { key: 'system-info', label: 'System Info' },
        { key: 'network-arp', label: 'ARP Table' },
        { key: 'system-logs', label: 'Logs' },
        { key: 'system-backup', label: 'Backup & Restore' },
        { key: 'system-monitoring', label: 'Monitoring' },
      ],
    },
    {
      key: 'admin',
      icon: <UserOutlined />,
      label: 'Admin',
      children: [
        { key: 'admin-users', label: 'Users & Roles' },
        { key: 'admin-settings', label: 'Settings' },
      ],
    },
    {
      key: 'help',
      icon: <QuestionCircleOutlined />,
      label: 'Help',
    },
  ]

  // Handle menu select - only update hash, don't touch openKeys
  const handleMenuSelect: MenuProps['onSelect'] = ({ key }) => {
    const keyStr = key.toString()
    setSelectedKey(keyStr)
    window.location.hash = keyStr

    // Close drawer on mobile after selection
    if (isMobile) {
      onCollapse(true)
    }
  }

  // Handle menu open/close - user controlled
  const handleOpenChange: MenuProps['onOpenChange'] = (keys) => {
    setOpenKeys(keys)
  }

  const renderMenu = () => (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selectedKey]}
      openKeys={openKeys}
      onOpenChange={handleOpenChange}
      items={menuItems}
      onSelect={handleMenuSelect}
    />
  )

  const sidebarContent = (
    <>
      <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
        <h3 style={{ color: '#fff', margin: 0, fontSize: collapsed ? 14 : 18 }}>
          {collapsed ? 'VyOS' : 'VyOS WebUI'}
        </h3>
      </div>
      {renderMenu()}
      {!collapsed && (
        <div style={{ padding: '16px', marginTop: 'auto' }}>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={logout}
            block
            style={{ color: '#fff' }}
          >
            Logout
          </Button>
        </div>
      )}
    </>
  )

  if (isMobile) {
    return (
      <Drawer
        title="VyOS WebUI"
        placement="left"
        onClose={() => onCollapse(true)}
        open={!collapsed}
        bodyStyle={{ padding: 0 }}
      >
        {renderMenu()}
      </Drawer>
    )
  }

  return (
    <Sider
      trigger={null}
      collapsible
      collapsed={collapsed}
      onCollapse={onCollapse}
      width={250}
      style={{ background: '#001529' }}
    >
      {sidebarContent}
    </Sider>
  )
}

interface SidebarProps {
  collapsed: boolean
  onCollapse: (collapsed: boolean) => void
  isMobile: boolean
}
