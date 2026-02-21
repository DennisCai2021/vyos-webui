/** System main page with tab navigation */

import { useState } from 'react'
import { Card, Tabs, Typography, Row, Col, Alert } from 'antd'
import {
  InfoCircleOutlined,
  FileTextOutlined,
  CloudServerOutlined,
  BarChartOutlined,
} from '@ant-design/icons'
import SystemInfo from './SystemInfo'
import Logs from './Logs'
import BackupRestore from './BackupRestore'
import Monitoring from './Monitoring'

const { Title } = Typography

export default function System() {
  const [activeTab, setActiveTab] = useState('info')

  const handleTabChange = (key: string) => {
    setActiveTab(key)
  }

  const tabItems = [
    {
      key: 'info',
      label: (
        <span>
          <InfoCircleOutlined />
          System Info
        </span>
      ),
      children: <SystemInfo />,
    },
    {
      key: 'logs',
      label: (
        <span>
          <FileTextOutlined />
          Logs
        </span>
      ),
      children: <Logs />,
    },
    {
      key: 'backup',
      label: (
        <span>
          <CloudServerOutlined />
          Backup & Restore
        </span>
      ),
      children: <BackupRestore />,
    },
    {
      key: 'monitoring',
      label: (
        <span>
          <BarChartOutlined />
          Monitoring
        </span>
      ),
      children: <Monitoring />,
    },
  ]

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>
            System
          </Title>
          <Typography.Text type="secondary">
            Manage system information, logs, backups, and monitoring
          </Typography.Text>
        </Col>
      </Row>

      <Alert
        message="System Management"
        description="Changes to system configuration may affect network connectivity. Please proceed with caution."
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Card bordered={false}>
        <Tabs activeKey={activeTab} onChange={handleTabChange} items={tabItems} />
      </Card>
    </div>
  )
}
