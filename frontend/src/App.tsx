import { useState, useEffect } from 'react'
import { ConfigProvider, theme } from 'antd'
import { AuthProvider, I18nProvider, ThemeProvider, useAuth } from './contexts'
import MainLayout from './components/layout/MainLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Network from './pages/network'
import Policy from './pages/policy'
import Security from './pages/security'
import NAT from './pages/nat/NAT'
import Firewall from './pages/security/Firewall'
import VPN from './pages/security/VPN'
import Admin from './pages/admin'
import System from './pages/system'
import Help from './pages/Help'
import './App.css'

const { darkAlgorithm } = theme

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard')

  // Handle hash changes for routing
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1) || 'dashboard'
      setCurrentPage(hash)
    }

    handleHashChange()
    window.addEventListener('hashchange', handleHashChange)

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  // Simple router
  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />
      case 'network':
      case 'interfaces':
      case 'network-interfaces':
      case 'network-vlan':
      case 'network-pppoe':
      case 'routing':
      case 'network-routes':
      case 'network-route-summary':
      case 'network-bgp':
      case 'network-isis':
      case 'services':
      case 'network-dns':
      case 'network-arp':
        return <Network />
      case 'policy':
      case 'policy-prefix-list':
      case 'policy-route-map':
      case 'policy-community-list':
        return <Policy />
      case 'firewall':
        return <Firewall />
      case 'nat':
      case 'nat-rules':
        return <NAT />
      case 'vpn':
        return <VPN />
      case 'security':
      case 'security-firewall':
      case 'security-vpn':
        return <Security />
      case 'admin':
      case 'admin-users':
      case 'admin-settings':
        return <Admin />
      case 'system':
      case 'system-info':
      case 'system-logs':
      case 'system-backup':
      case 'system-monitoring':
        return <System />
      case 'help':
        return <Help />
      case 'login':
        return <Login />
      default:
        // For now, show dashboard for other pages
        return <Dashboard />
    }
  }

  const AppContent = () => {
    const { isAuthenticated, isLoading } = useAuth()

    if (isLoading) {
      return <div>Loading...</div>
    }

    if (!isAuthenticated) {
      return <Login />
    }

    return <MainLayout>{renderPage()}</MainLayout>
  }

  return (
    <ThemeProvider>
      <ConfigProvider
        theme={{
          algorithm: darkAlgorithm,
          token: {
            colorPrimary: '#1890ff',
            borderRadius: 6,
          },
        }}
      >
        <AuthProvider>
          <I18nProvider>
            <AppContent />
          </I18nProvider>
        </AuthProvider>
      </ConfigProvider>
    </ThemeProvider>
  )
}

export default App
