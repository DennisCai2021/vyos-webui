/** Main application layout component */

import { useState, useEffect, type ReactNode } from 'react'
import { Layout, Breadcrumb } from 'antd'
import { HomeOutlined } from '@ant-design/icons'
import { useAuth } from '../../contexts'
import { HeaderComponent } from './Header'
import { Sidebar } from './Sidebar'

const { Content } = Layout

interface MainLayoutProps {
  children: ReactNode
}

interface BreadcrumbItem {
  title: string
  path?: string
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { isAuthenticated, isLoading } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { title: 'Dashboard' },
  ])

  // Handle responsive design
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)

      // Auto collapse sidebar on mobile
      if (mobile && !collapsed) {
        setCollapsed(true)
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [collapsed])

  // Update breadcrumbs based on current path
  useEffect(() => {
    const updateBreadcrumbs = () => {
      const path = window.location.hash.slice(1) || '/'

      const breadcrumbMap: Record<string, BreadcrumbItem[]> = {
        '/': [{ title: 'Dashboard', path: '/' }],
        '/network': [
          { title: 'Network', path: '/network' },
          { title: 'Interfaces', path: '/network/interfaces' },
        ],
        '/network/interfaces': [
          { title: 'Network', path: '/network' },
          { title: 'Interfaces', path: '/network/interfaces' },
        ],
        '/network/routing': [
          { title: 'Network', path: '/network' },
          { title: 'Routing', path: '/network/routing' },
        ],
        '/network/dns': [
          { title: 'Network', path: '/network' },
          { title: 'DNS', path: '/network/dns' },
        ],
        '/security': [
          { title: 'Security', path: '/security' },
          { title: 'Firewall', path: '/security/firewall' },
        ],
        '/security/firewall': [
          { title: 'Security', path: '/security' },
          { title: 'Firewall', path: '/security/firewall' },
        ],
        '/security/vpn': [
          { title: 'Security', path: '/security' },
          { title: 'VPN', path: '/security/vpn' },
        ],
        '/system': [
          { title: 'System', path: '/system' },
          { title: 'System Info', path: '/system/info' },
        ],
        '/system/info': [
          { title: 'System', path: '/system' },
          { title: 'System Info', path: '/system/info' },
        ],
        '/system/logs': [
          { title: 'System', path: '/system' },
          { title: 'Logs', path: '/system/logs' },
        ],
        '/system/backup': [
          { title: 'System', path: '/system' },
          { title: 'Backup & Restore', path: '/system/backup' },
        ],
        '/system/monitoring': [
          { title: 'System', path: '/system' },
          { title: 'Monitoring', path: '/system/monitoring' },
        ],
        '/admin': [
          { title: 'Admin', path: '/admin' },
          { title: 'Users', path: '/admin/users' },
        ],
        '/admin/users': [
          { title: 'Admin', path: '/admin' },
          { title: 'Users', path: '/admin/users' },
        ],
        '/admin/settings': [
          { title: 'Admin', path: '/admin' },
          { title: 'Settings', path: '/admin/settings' },
        ],
      }

      const crumbs = breadcrumbMap[path] || breadcrumbMap['/']

      // Add home breadcrumb at the beginning
      setBreadcrumbs([
        { title: 'Home', path: '/' },
        ...crumbs.filter((crumb) => crumb.title !== 'Dashboard'),
      ])
    }

    // Listen for hash changes
    window.addEventListener('hashchange', updateBreadcrumbs)
    updateBreadcrumbs()

    return () => {
      window.removeEventListener('hashchange', updateBreadcrumbs)
    }
  }, [])

  // Show loading state
  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading...</div>
      </div>
    )
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <>{children}</>
  }

  // Show main layout if authenticated
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sidebar collapsed={collapsed} onCollapse={setCollapsed} isMobile={isMobile} />
      <Layout>
        <HeaderComponent collapsed={collapsed} onCollapse={() => setCollapsed(!collapsed)} />
        <Content style={{ padding: '24px' }}>
          <Breadcrumb style={{ marginBottom: '16px' }}>
            {breadcrumbs.map((crumb, index) => (
              <Breadcrumb.Item
                key={index}
                href={crumb.path}
                onClick={(e) => {
                  e.preventDefault()
                  if (crumb.path) {
                    window.location.hash = crumb.path
                  }
                }}
              >
                {index === 0 && <HomeOutlined style={{ marginRight: '4px' }} />}
                {crumb.title}
              </Breadcrumb.Item>
            ))}
          </Breadcrumb>
          <div className="content-wrapper">{children}</div>
        </Content>
      </Layout>
    </Layout>
  )
}
