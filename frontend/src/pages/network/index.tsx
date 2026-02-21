import { useState, useEffect } from 'react'
import { Card, Row, Col, Typography, Breadcrumb, Button } from 'antd'
import {
  GlobalOutlined,
  GroupOutlined,
  CloudOutlined,
  DesktopOutlined,
  ArrowRightOutlined,
  ApiOutlined,
  ShareAltOutlined,
  LinkOutlined,
  FundOutlined,
} from '@ant-design/icons'
import Interfaces from './Interfaces'
import Routes from './Routes'
import RouteSummary from './RouteSummary'
import DNS from './DNS'
import ARP from './ARP'
import VLAN from './VLAN'
import BGP from './BGP'
import ISIS from './ISIS'
import PPPoE from './PPPoE'

const { Title, Text } = Typography

type NetworkSubPage = 'interfaces' | 'routes' | 'route-summary' | 'dns' | 'arp' | 'vlan' | 'bgp' | 'isis' | 'pppoe' | null

interface NetworkCardProps {
  title: string
  description: string
  icon: React.ReactNode
  onClick: () => void
}

function NetworkCard({ title, description, icon, onClick }: NetworkCardProps) {
  return (
    <Card
      hoverable
      onClick={onClick}
      style={{ height: '100%' }}
      styles={{ body: { display: 'flex', flexDirection: 'column', height: '100%' } }}
    >
      <div style={{ marginBottom: 16, fontSize: 32 }}>{icon}</div>
      <Title level={4} style={{ margin: 0, marginBottom: 8 }}>
        {title}
      </Title>
      <Text type="secondary" style={{ flex: 1 }}>
        {description}
      </Text>
      <div style={{ marginTop: 16, color: '#1890ff' }}>
        <ArrowRightOutlined />
      </div>
    </Card>
  )
}

// Map URL hash to subpage
const hashToSubpage: Record<string, NetworkSubPage> = {
  'network-interfaces': 'interfaces',
  'network-routes': 'routes',
  'network-route-summary': 'route-summary',
  'network-dns': 'dns',
  'network-arp': 'arp',
  'network-vlan': 'vlan',
  'network-bgp': 'bgp',
  'network-isis': 'isis',
  'network-pppoe': 'pppoe',
}

// Map hash to parent section name for breadcrumb
const hashToParentSection: Record<string, string> = {
  'network-interfaces': 'Interfaces',
  'network-vlan': 'Interfaces',
  'network-pppoe': 'Interfaces',
  'network-routes': 'Routing',
  'network-route-summary': 'Routing',
  'network-bgp': 'Routing',
  'network-isis': 'Routing',
  'network-dns': 'Services',
  'network-arp': 'System',
}

export default function Network() {
  const [activePage, setActivePage] = useState<NetworkSubPage>(null)

  // Sync with URL hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1)
      const subpage = hashToSubpage[hash]
      setActivePage(subpage || null)
    }

    handleHashChange()
    window.addEventListener('hashchange', handleHashChange)

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  const navigateTo = (subpage: NetworkSubPage) => {
    const hashMap: Record<NonNullable<NetworkSubPage>, string> = {
      interfaces: 'network-interfaces',
      routes: 'network-routes',
      'route-summary': 'network-route-summary',
      dns: 'network-dns',
      arp: 'network-arp',
      vlan: 'network-vlan',
      bgp: 'network-bgp',
      isis: 'network-isis',
      pppoe: 'network-pppoe',
    }
    if (subpage) {
      window.location.hash = hashMap[subpage]
    } else {
      window.location.hash = 'network'
    }
  }

  const pageTitleMap: Record<NonNullable<NetworkSubPage>, string> = {
    interfaces: 'Network Interfaces',
    routes: 'Routing Table',
    'route-summary': 'Routing Table Summary',
    dns: 'DNS Configuration',
    arp: 'ARP Table',
    vlan: 'VLAN Interfaces',
    bgp: 'BGP Configuration',
    isis: 'IS-IS Configuration',
    pppoe: 'PPPoE Interfaces',
  }

  // Get parent section name based on current hash
  const getParentSection = (): string => {
    const hash = window.location.hash.slice(1)
    return hashToParentSection[hash] || 'Network'
  }

  if (!activePage) {
    return (
      <div>
        <Breadcrumb
          items={[{ title: 'Dashboard', href: '#dashboard' }, { title: 'Network' }]}
          style={{ marginBottom: 16 }}
        />
        <Title level={2} style={{ marginBottom: 24 }}>
          Network Configuration
        </Title>

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <NetworkCard
              title="Interfaces"
              description="Configure network interfaces, IP addresses, and physical layer settings"
              icon={<GlobalOutlined />}
              onClick={() => navigateTo('interfaces')}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <NetworkCard
              title="VLAN Interfaces"
              description="Configure VLAN interfaces (802.1Q) for network segmentation"
              icon={<ApiOutlined />}
              onClick={() => navigateTo('vlan')}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <NetworkCard
              title="Routing"
              description="Manage static and connected routes, configure default gateways"
              icon={<GroupOutlined />}
              onClick={() => navigateTo('routes')}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <NetworkCard
              title="Routing Summary"
              description="View complete routing table with route source and status information"
              icon={<FundOutlined />}
              onClick={() => navigateTo('route-summary')}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <NetworkCard
              title="DNS"
              description="Configure DNS servers, search domains, and forwarding"
              icon={<CloudOutlined />}
              onClick={() => navigateTo('dns')}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <NetworkCard
              title="ARP Table"
              description="View and manage Address Resolution Protocol cache entries"
              icon={<DesktopOutlined />}
              onClick={() => navigateTo('arp')}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <NetworkCard
              title="BGP"
              description="Configure Border Gateway Protocol for inter-domain routing"
              icon={<ShareAltOutlined />}
              onClick={() => navigateTo('bgp')}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <NetworkCard
              title="IS-IS"
              description="Configure Intermediate System to Intermediate System for link-state routing"
              icon={<ApiOutlined />}
              onClick={() => navigateTo('isis')}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <NetworkCard
              title="PPPoE"
              description="Configure Point-to-Point Protocol over Ethernet for broadband connections"
              icon={<LinkOutlined />}
              onClick={() => navigateTo('pppoe')}
            />
          </Col>
        </Row>

        {/* Quick Stats */}
        <Card title="Network Overview" bordered={false} style={{ marginTop: 24 }}>
          <Row gutter={16}>
            <Col xs={24} sm={12} md={6}>
              <div>
                <Text type="secondary">Active Interfaces</Text>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 8 }}>-</div>
              </div>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <div>
                <Text type="secondary">Static Routes</Text>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 8 }}>-</div>
              </div>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <div>
                <Text type="secondary">DNS Servers</Text>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 8 }}>-</div>
              </div>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <div>
                <Text type="secondary">ARP Entries</Text>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 8 }}>-</div>
              </div>
            </Col>
          </Row>
        </Card>
      </div>
    )
  }

  const parentSection = getParentSection()

  return (
    <div>
      <Breadcrumb
        items={[
          { title: 'Dashboard', href: '#dashboard' },
          { title: parentSection },
          { title: pageTitleMap[activePage] },
        ]}
        style={{ marginBottom: 16 }}
      />

      {activePage === 'interfaces' && <Interfaces />}
      {activePage === 'vlan' && <VLAN />}
      {activePage === 'routes' && <Routes />}
      {activePage === 'route-summary' && <RouteSummary />}
      {activePage === 'dns' && <DNS />}
      {activePage === 'arp' && <ARP />}
      {activePage === 'bgp' && <BGP />}
      {activePage === 'isis' && <ISIS />}
      {activePage === 'pppoe' && <PPPoE />}
    </div>
  )
}
