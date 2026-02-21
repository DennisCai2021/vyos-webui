import { useState, useEffect } from 'react'
import { Card, Row, Col, Typography, Breadcrumb, Button } from 'antd'
import {
  FilterOutlined,
  SwapOutlined,
  TagsOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons'
import PrefixList from './PrefixList'
import RouteMap from './RouteMap'
import CommunityList from './CommunityList'

const { Title, Text } = Typography

type PolicySubPage = 'prefix-list' | 'route-map' | 'community-list' | null

interface PolicyCardProps {
  title: string
  description: string
  icon: React.ReactNode
  onClick: () => void
}

function PolicyCard({ title, description, icon, onClick }: PolicyCardProps) {
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
const hashToSubpage: Record<string, PolicySubPage> = {
  'policy-prefix-list': 'prefix-list',
  'policy-route-map': 'route-map',
  'policy-community-list': 'community-list',
}

export default function Policy() {
  const [activePage, setActivePage] = useState<PolicySubPage>(null)

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

  const navigateTo = (subpage: PolicySubPage) => {
    const hashMap: Record<NonNullable<PolicySubPage>, string> = {
      'prefix-list': 'policy-prefix-list',
      'route-map': 'policy-route-map',
      'community-list': 'policy-community-list',
    }
    if (subpage) {
      window.location.hash = hashMap[subpage]
    } else {
      window.location.hash = 'policy'
    }
  }

  const pageTitleMap: Record<NonNullable<PolicySubPage>, string> = {
    'prefix-list': 'Prefix Lists',
    'route-map': 'Route Maps',
    'community-list': 'Community Lists',
  }

  if (!activePage) {
    return (
      <div>
        <Breadcrumb
          items={[{ title: 'Dashboard', href: '#dashboard' }, { title: 'Policy' }]}
          style={{ marginBottom: 16 }}
        />
        <Title level={2} style={{ marginBottom: 24 }}>
          Policy Configuration
        </Title>

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={8}>
            <PolicyCard
              title="Prefix Lists"
              description="Filter IP prefixes for routing policies"
              icon={<FilterOutlined />}
              onClick={() => navigateTo('prefix-list')}
            />
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <PolicyCard
              title="Route Maps"
              description="Define complex routing policies and route manipulation"
              icon={<SwapOutlined />}
              onClick={() => navigateTo('route-map')}
            />
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <PolicyCard
              title="Community Lists"
              description="Manage BGP community attributes"
              icon={<TagsOutlined />}
              onClick={() => navigateTo('community-list')}
            />
          </Col>
        </Row>
      </div>
    )
  }

  return (
    <div>
      <Breadcrumb
        items={[
          { title: 'Dashboard', href: '#dashboard' },
          { title: 'Policy' },
          { title: pageTitleMap[activePage] },
        ]}
        style={{ marginBottom: 16 }}
      />

      {activePage === 'prefix-list' && <PrefixList />}
      {activePage === 'route-map' && <RouteMap />}
      {activePage === 'community-list' && <CommunityList />}
    </div>
  )
}
