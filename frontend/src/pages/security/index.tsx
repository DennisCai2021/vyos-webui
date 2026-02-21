import { useState } from 'react'
import { Card, Row, Col, Typography, Breadcrumb, Button } from 'antd'
import { ArrowRightOutlined, SafetyOutlined, TeamOutlined } from '@ant-design/icons'
import Firewall from './Firewall'
import VPN from './VPN'

const { Title, Text } = Typography

type SecuritySubPage = 'firewall' | 'vpn' | null

interface SecurityCardProps {
  title: string
  description: string
  icon: React.ReactNode
  onClick: () => void
}

function SecurityCard({ title, description, icon, onClick }: SecurityCardProps) {
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

export default function Security() {
  const [activePage, setActivePage] = useState<SecuritySubPage>(null)

  const pageTitleMap: Record<string, string> = {
    firewall: 'Firewall Policy',
    vpn: 'VPN Management',
  }

  if (!activePage) {
    return (
      <div>
        <Breadcrumb
          items={[
            { title: 'Dashboard', href: '#dashboard' },
            { title: 'Security' }
          ]}
          style={{ marginBottom: 16 }}
        />
        <Title level={2} style={{ marginBottom: 24 }}>
          Security Configuration
        </Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <SecurityCard
              title="Firewall"
              description="Configure firewall policies, NAT rules, and security groups"
              icon={<SafetyOutlined />}
              onClick={() => setActivePage('firewall')}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <SecurityCard
              title="VPN"
              description="Manage IPsec, OpenVPN and WireGuard VPN connections"
              icon={<TeamOutlined />}
              onClick={() => setActivePage('vpn')}
            />
          </Col>
        </Row>
        <Card title="Security Overview" bordered={false} style={{ marginTop: 24 }}>
          <Row gutter={16}>
            <Col xs={24} sm={12} md={6}>
              <div>
                <Text type="secondary">Active Rules</Text>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 8 }}>5</div>
              </div>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <div>
                <Text type="secondary">NAT Rules</Text>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 8 }}>3</div>
              </div>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <div>
                <Text type="secondary">VPN Tunnels</Text>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 8 }}>0</div>
              </div>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <div>
                <Text type="secondary">Security Groups</Text>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 8 }}>4</div>
              </div>
            </Col>
          </Row>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <Breadcrumb
        items={[
          { title: 'Dashboard', href: '#dashboard' },
          { title: 'Security', onClick: () => setActivePage(null) },
          { title: activePage ? pageTitleMap[activePage] : '' },
        ]}
        style={{ marginBottom: 16 }}
      />
      <div style={{ marginBottom: 16 }}>
        <Button type="link" onClick={() => setActivePage(null)}>
          ← Back to Security Menu
        </Button>
      </div>
      {activePage === 'firewall' && <Firewall />}
      {activePage === 'vpn' && <VPN />}
    </div>
  )
}
