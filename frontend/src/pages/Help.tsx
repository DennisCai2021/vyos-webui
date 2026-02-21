/** Help and Documentation page */

import { useState } from 'react'
import {
  Card,
  Row,
  Col,
  Input,
  Typography,
  List,
  Breadcrumb,
  Space,
  Button,
  Divider,
  Tag,
  Alert,
} from 'antd'
import {
  SearchOutlined,
  BookOutlined,
  QuestionCircleOutlined,
  GlobalOutlined,
  SafetyOutlined,
  InfoCircleOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons'

const { Title, Text, Paragraph } = Typography
const { Search } = Input

interface HelpTopic {
  id: string
  title: string
  category: 'getting-started' | 'networking' | 'firewall' | 'vpn' | 'system' | 'troubleshooting'
  content: string
  tags: string[]
}

const helpTopics: HelpTopic[] = [
  {
    id: 'getting-started-1',
    title: 'Accessing the Web UI',
    category: 'getting-started',
    content: `
# Accessing the Web UI

## First-time Access

1. Connect to your VyOS device via SSH
2. Enable the web UI service
3. Access via https://<your-vyos-ip>

## Default Credentials

- Username: vyos
- Password: vyos

**Important**: Change the default password immediately after first login.

## Supported Browsers

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
    `,
    tags: ['getting-started', 'login', 'setup'],
  },
  {
    id: 'networking-1',
    title: 'Configuring Network Interfaces',
    category: 'networking',
    content: `
# Configuring Network Interfaces

## Basic Interface Configuration

1. Navigate to Network > Interfaces
2. Click "Add Interface" or select an existing interface
3. Configure IP address, subnet mask, and other settings

## DHCP Configuration

To configure an interface for DHCP:
\`\`\`
set interfaces ethernet eth0 address dhcp
\`\`\`

## Static IP Configuration

To set a static IP:
\`\`\`
set interfaces ethernet eth0 address 192.168.1.1/24
\`\`\`
    `,
    tags: ['network', 'interfaces', 'ip', 'dhcp'],
  },
  {
    id: 'firewall-1',
    title: 'Creating Firewall Rules',
    category: 'firewall',
    content: `
# Creating Firewall Rules

## Rule Order Matters

Firewall rules are evaluated in order. The first matching rule wins.

## Basic Rule Structure

1. **Action**: Accept, Drop, or Reject
2. **Source**: Source IP address or network
3. **Destination**: Destination IP address or network
4. **Protocol**: TCP, UDP, ICMP, or ANY
5. **Ports**: Source and destination ports

## Example: Allow SSH

To allow SSH access from a specific network:
- Action: Accept
- Source: 192.168.1.0/24
- Protocol: TCP
- Destination Port: 22
    `,
    tags: ['firewall', 'rules', 'security'],
  },
  {
    id: 'vpn-1',
    title: 'Setting up WireGuard VPN',
    category: 'vpn',
    content: `
# Setting up WireGuard VPN

## Overview

WireGuard is a modern VPN protocol that is fast and secure.

## Server Setup

1. Generate key pair
2. Configure WireGuard interface
3. Add peers
4. Enable the interface

## Client Setup

Import the generated configuration and connect.
    `,
    tags: ['vpn', 'wireguard', 'remote-access'],
  },
  {
    id: 'troubleshooting-1',
    title: 'Common Issues',
    category: 'troubleshooting',
    content: `
# Common Issues and Solutions

## Cannot access Web UI

1. Check if the service is running
2. Verify firewall rules allow access
3. Check network connectivity

## Configuration not saving

1. Check user permissions
2. Verify disk space
3. Check system logs

## VPN won't connect

1. Verify certificates/keys
2. Check firewall rules
3. Review VPN logs
    `,
    tags: ['troubleshooting', 'issues', 'faq'],
  },
]

const categoryIcons = {
  'getting-started': <BookOutlined />,
  'networking': <GlobalOutlined />,
  'firewall': <SafetyOutlined />,
  'vpn': <SafetyOutlined />,
  'system': <InfoCircleOutlined />,
  'troubleshooting': <QuestionCircleOutlined />,
}

export default function Help() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTopic, setSelectedTopic] = useState<HelpTopic | null>(null)

  const filteredTopics = helpTopics.filter(topic =>
    topic.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    topic.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    topic.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const handleTopicSelect = (topic: HelpTopic) => {
    setSelectedTopic(topic)
  }

  const handleBack = () => {
    setSelectedTopic(null)
  }

  const renderMarkdown = (content: string) => {
    const lines = content.trim().split('\n')
    return lines.map((line, index) => {
      if (line.startsWith('# ')) {
        return <Title key={index} level={3}>{line.slice(2)}</Title>
      }
      if (line.startsWith('## ')) {
        return <Title key={index} level={4}>{line.slice(3)}</Title>
      }
      if (line.trim().startsWith('```')) {
        return null
      }
      if (line.trim().startsWith('1.') || line.trim().startsWith('2.') || line.trim().startsWith('3.') || line.trim().startsWith('4.')) {
        return <li key={index}>{line.trim().slice(2)}</li>
      }
      if (line.trim().startsWith('- ')) {
        return <li key={index}>{line.trim().slice(2)}</li>
      }
      if (line.trim()) {
        return <Paragraph key={index}>{line}</Paragraph>
      }
      return <br key={index} />
    })
  }

  if (selectedTopic) {
    return (
      <div>
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Breadcrumb>
              <Breadcrumb.Item>
                <Button type="link" icon={<ArrowLeftOutlined />} onClick={handleBack}>
                  Help
                </Button>
              </Breadcrumb.Item>
              <Breadcrumb.Item>{selectedTopic.title}</Breadcrumb.Item>
            </Breadcrumb>
          </Col>
        </Row>

        <Card>
          <Row gutter={16}>
            <Col xs={24} lg={18}>
              <Title level={2}>{selectedTopic.title}</Title>
              <Space wrap style={{ marginBottom: 16 }}>
                {selectedTopic.tags.map(tag => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </Space>
              <Divider />
              {renderMarkdown(selectedTopic.content)}
            </Col>
            <Col xs={24} lg={6}>
              <Card title="Related Topics" size="small">
                <List
                  dataSource={helpTopics.filter(t => t.id !== selectedTopic.id && t.category === selectedTopic.category).slice(0, 5)}
                  renderItem={topic => (
                    <List.Item>
                      <Button type="link" onClick={() => handleTopicSelect(topic)}>
                        {topic.title}
                      </Button>
                    </List.Item>
                  )}
                />
              </Card>
            </Col>
          </Row>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>
            <BookOutlined /> Help & Documentation
          </Title>
          <Text type="secondary">
            Find guides, tutorials, and troubleshooting information
          </Text>
        </Col>
      </Row>

      <Alert
        message="Quick Tips"
        description="Use the search bar to find documentation. You can also browse by category below."
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Card style={{ marginBottom: 16 }}>
        <Search
          placeholder="Search documentation..."
          allowClear
          enterButton={<SearchOutlined />}
          size="large"
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </Card>

      <Row gutter={16}>
        <Col xs={24} lg={8}>
          <Card title="Categories" size="small">
            <List
              dataSource={[
                { key: 'getting-started', label: 'Getting Started', icon: <BookOutlined /> },
                { key: 'networking', label: 'Networking', icon: <GlobalOutlined /> },
                { key: 'firewall', label: 'Firewall', icon: <SafetyOutlined /> },
                { key: 'vpn', label: 'VPN', icon: <SafetyOutlined /> },
                { key: 'system', label: 'System', icon: <InfoCircleOutlined /> },
                { key: 'troubleshooting', label: 'Troubleshooting', icon: <QuestionCircleOutlined /> },
              ]}
              renderItem={item => (
                <List.Item>
                  <Button type="link" icon={item.icon} block style={{ textAlign: 'left' }}>
                    {item.label}
                  </Button>
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <Card title={searchQuery ? 'Search Results' : 'All Topics'}>
            <List
              dataSource={filteredTopics}
              renderItem={topic => (
                <List.Item
                  actions={[
                    <Button type="link" key="view" onClick={() => handleTopicSelect(topic)}>
                      View
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={categoryIcons[topic.category]}
                    title={
                      <Space>
                        {topic.title}
                        <Tag>{topic.category}</Tag>
                      </Space>
                    }
                    description={
                      <Space wrap>
                        {topic.tags.map(tag => (
                          <Tag key={tag}>{tag}</Tag>
                        ))}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
