/** Simple Login page */

import { useState } from 'react'
import { Form, Input, Button, Card, Typography, Checkbox, message } from 'antd'
import { UserOutlined, LockOutlined, EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons'
import { useAuth } from '../contexts'
import type { LoginRequest } from '../types'

const { Title, Text } = Typography

export default function Login() {
  const { login } = useAuth()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const onFinish = async (values: LoginRequest & { remember?: boolean }) => {
    setLoading(true)

    try {
      await login(values)
      message.success('Login successful')
    } catch (error: any) {
      console.error('Login error:', error)
      message.error(error.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword)
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#1f1f1f',
        padding: '20px',
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 8,
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={3} style={{ marginBottom: 4 }}>
            VyOS WebUI
          </Title>
          <Text type="secondary">Sign in to your account</Text>
        </div>

        {/* Login Form */}
        <Form
          name="login"
          onFinish={onFinish}
          autoComplete="off"
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: 'Please enter username' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="Username"
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Please enter password' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Password"
              autoComplete="current-password"
              visibilityToggle={{
                visible: showPassword,
                onVisibleChange: togglePasswordVisibility,
              }}
              iconRender={visible =>
                visible ? <EyeOutlined /> : <EyeInvisibleOutlined />
              }
            />
          </Form.Item>

          <Form.Item name="remember" valuePropName="checked">
            <Checkbox>Remember me</Checkbox>
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </Form.Item>
        </Form>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            VyOS WebUI © {new Date().getFullYear()}
          </Text>
        </div>
      </Card>
    </div>
  )
}
