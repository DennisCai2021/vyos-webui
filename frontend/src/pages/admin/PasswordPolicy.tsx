/** Password policy configuration component */

import { useState, useEffect } from 'react'
import {
  Card,
  Form,
  Switch,
  InputNumber,
  Button,
  message,
  Typography,
  Alert,
  Row,
  Col,
  Divider,
  Progress,
} from 'antd'
import {
  SaveOutlined,
  ReloadOutlined,
  SafetyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'
import { Space } from 'antd'
import { adminApi } from '../../api'
import type { PasswordPolicy } from '../../types'

const { Title, Text } = Typography

interface PolicyFormData {
  min_length: number
  require_uppercase: boolean
  require_lowercase: boolean
  require_numbers: boolean
  require_special_chars: boolean
  max_age_days?: number
  history_count?: number
}

export default function PasswordPolicy() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [policy, setPolicy] = useState<PasswordPolicy | null>(null)
  const [form] = Form.useForm<PolicyFormData>()

  const loadPolicy = async () => {
    setLoading(true)
    try {
      const data = await adminApi.getPasswordPolicy()
      setPolicy(data)
      form.setFieldsValue(data)
    } catch (error) {
      message.error('Failed to load password policy')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPolicy()
  }, [])

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      await adminApi.updatePasswordPolicy(values)
      setPolicy(values)
      message.success('Password policy updated successfully')
    } catch (error) {
      console.error('Failed to save policy:', error)
    } finally {
      setSaving(false)
    }
  }

  const calculateStrength = (data: PolicyFormData): number => {
    let score = 0

    // Min length
    if (data.min_length >= 12) score += 25
    else if (data.min_length >= 10) score += 20
    else if (data.min_length >= 8) score += 15
    else if (data.min_length >= 6) score += 10
    else score += 5

    // Character requirements
    if (data.require_uppercase) score += 15
    if (data.require_lowercase) score += 10
    if (data.require_numbers) score += 15
    if (data.require_special_chars) score += 20

    // Expiration
    if (data.max_age_days && data.max_age_days <= 90) score += 5

    return Math.min(score, 100)
  }

  const getStrengthColor = (score: number): string => {
    if (score >= 80) return '#52c41a'
    if (score >= 60) return '#faad14'
    if (score >= 40) return '#fa8c16'
    return '#ff4d4f'
  }

  const getStrengthLabel = (score: number): string => {
    if (score >= 80) return 'Very Strong'
    if (score >= 60) return 'Strong'
    if (score >= 40) return 'Medium'
    return 'Weak'
  }

  const currentStrength = policy ? calculateStrength(policy) : 0

  return (
    <div>
      <Alert
        message="Password Policy"
        description="Configure password security requirements for all users."
        type="info"
        showIcon
        icon={<SafetyOutlined />}
        style={{ marginBottom: 16 }}
      />

      <Row gutter={24}>
        <Col xs={24} lg={8}>
          <Card title="Password Strength" bordered={false}>
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <SafetyOutlined
                style={{
                  fontSize: 64,
                  color: getStrengthColor(currentStrength),
                  marginBottom: 16,
                }}
              />
              <Progress
                type="dashboard"
                percent={currentStrength}
                strokeColor={getStrengthColor(currentStrength)}
                format={() => getStrengthLabel(currentStrength)}
              />
              <Title level={4} style={{ marginTop: 16 }}>
                {currentStrength}% Strength Score
              </Title>
            </div>

            <Divider />

            <div style={{ padding: '0 16px' }}>
              <Title level={5}>Requirements Met:</Title>
              {policy && (
                <div>
                  <SpaceCheck
                    checked={policy.min_length >= 8}
                    text="Minimum 8 characters"
                  />
                  <SpaceCheck
                    checked={policy.require_uppercase}
                    text="Uppercase letters (A-Z)"
                  />
                  <SpaceCheck
                    checked={policy.require_lowercase}
                    text="Lowercase letters (a-z)"
                  />
                  <SpaceCheck
                    checked={policy.require_numbers}
                    text="Numbers (0-9)"
                  />
                  <SpaceCheck
                    checked={policy.require_special_chars}
                    text="Special characters (!@#$%^&*)"
                  />
                  {policy.max_age_days && (
                    <SpaceCheck
                      checked={true}
                      text={`Password expires after ${policy.max_age_days} days`}
                    />
                  )}
                  {policy.history_count && (
                    <SpaceCheck
                      checked={true}
                      text={`Remember last ${policy.history_count} passwords`}
                    />
                  )}
                </div>
              )}
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <Card
            title="Policy Configuration"
            bordered={false}
            extra={
              <Space>
                <Button icon={<ReloadOutlined />} onClick={loadPolicy} loading={loading}>
                  Reset
                </Button>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={handleSave}
                  loading={saving}
                >
                  Save Policy
                </Button>
              </Space>
            }
          >
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                min_length: 8,
                require_uppercase: true,
                require_lowercase: true,
                require_numbers: true,
                require_special_chars: false,
              }}
            >
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="min_length"
                    label="Minimum Password Length"
                    rules={[{ required: true, message: 'Please set minimum length' }]}
                    tooltip="Recommended: 8 or more characters"
                  >
                    <InputNumber
                      min={4}
                      max={32}
                      addonAfter="characters"
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="max_age_days"
                    label="Password Expiration (Days)"
                    tooltip="Leave empty for no expiration"
                  >
                    <InputNumber
                      min={1}
                      max={365}
                      addonAfter="days"
                      placeholder="No expiration"
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="history_count"
                    label="Password History"
                    tooltip="Number of previous passwords to remember"
                  >
                    <InputNumber
                      min={0}
                      max={24}
                      addonAfter="passwords"
                      placeholder="No history"
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Divider />

              <Title level={5}>Character Requirements</Title>

              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="require_uppercase"
                    label="Require Uppercase Letters"
                    valuePropName="checked"
                  >
                    <Switch checkedChildren="Yes" unCheckedChildren="No" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="require_lowercase"
                    label="Require Lowercase Letters"
                    valuePropName="checked"
                  >
                    <Switch checkedChildren="Yes" unCheckedChildren="No" />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="require_numbers"
                    label="Require Numbers"
                    valuePropName="checked"
                  >
                    <Switch checkedChildren="Yes" unCheckedChildren="No" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="require_special_chars"
                    label="Require Special Characters"
                    valuePropName="checked"
                    tooltip="e.g., !@#$%^&*"
                  >
                    <Switch checkedChildren="Yes" unCheckedChildren="No" />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </Card>

          <Card
            title="Recommendations"
            bordered={false}
            style={{ marginTop: 16 }}
          >
            <Alert
              message="Best Practices"
              description="For maximum security, we recommend: Minimum 12 characters, mixed case, numbers, special characters, and 90-day expiration."
              type="info"
              showIcon
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

function SpaceCheck({ checked, text }: { checked: boolean; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
      {checked ? (
        <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
      ) : (
        <CloseCircleOutlined style={{ color: '#d9d9d9', marginRight: 8 }} />
      )}
      <Text type={checked ? 'secondary' : 'secondary'} delete={!checked}>
        {text}
      </Text>
    </div>
  )
}
