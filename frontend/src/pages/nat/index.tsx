import { useState } from 'react'
import { Card, Row, Col, Typography, Breadcrumb, Button } from 'antd'
import { ArrowRightOutlined, SwapOutlined, GlobalOutlined } from '@ant-design/icons'
import NAT from './NAT'

const { Title, Text } = Typography

type NATSubPage = 'rules' | null

interface NATCardProps {
  title: string
  description: string
  icon: React.ReactNode
  onClick: () => void
}

function NATCard({ title, description, icon, onClick }: NATCardProps) {
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

export default function NATPage() {
  const [activePage, setActivePage] = useState<NATSubPage>(null)

  const pageTitleMap: Record<string, string> = {
    rules: 'NAT Rules',
  }

  if (!activePage) {
    return (
      <div>
        <Breadcrumb
          items={[
            { title: 'Dashboard', href: '#dashboard' },
            { title: 'NAT' }
          ]}
          style={{ marginBottom: 16 }}
        />
        <Title level={2} style={{ marginBottom: 24 }}>
          NAT Configuration
        </Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={8}>
            <NATCard
              title="NAT Rules"
              description="Configure Source NAT, Destination NAT, and Masquerade rules"
              icon={<SwapOutlined />}
              onClick={() => setActivePage('rules')}
            />
          </Col>
        </Row>
        <Card title="NAT Overview" bordered={false} style={{ marginTop: 24 }}>
          <Row gutter={16}>
            <Col xs={24} sm={12} md={6}>
              <div>
                <Text type="secondary">NAT44 (IPv4)</Text>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 8 }}>Available</div>
              </div>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <div>
                <Text type="secondary">NAT64 (IPv6→IPv4)</Text>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 8 }}>Available</div>
              </div>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <div>
                <Text type="secondary">NAT66 (NPTv6)</Text>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 8 }}>Available</div>
              </div>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <div>
                <Text type="secondary">CGNAT</Text>
                <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 8 }}>Available</div>
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
          { title: 'NAT', onClick: () => setActivePage(null) },
          { title: activePage ? pageTitleMap[activePage] : '' },
        ]}
        style={{ marginBottom: 16 }}
      />
      <div style={{ marginBottom: 16 }}>
        <Button type="link" onClick={() => setActivePage(null)}>
          ← Back to NAT Menu
        </Button>
      </div>
      {activePage === 'rules' && <NAT />}
    </div>
  )
}
