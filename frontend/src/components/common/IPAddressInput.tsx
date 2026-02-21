/** IP Address Input Component */

import { useState, useEffect } from 'react'
import { Input, Tooltip } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'

interface IPAddressInputProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  allowCIDR?: boolean
  ipv6?: boolean
  disabled?: boolean
  error?: boolean
  helpText?: string
}

export function IPAddressInput({
  value = '',
  onChange,
  placeholder = '192.168.1.1',
  allowCIDR = false,
  ipv6 = false,
  disabled = false,
  error = false,
  helpText,
}: IPAddressInputProps) {
  const [internalValue, setInternalValue] = useState(value)
  const [isValid, setIsValid] = useState(true)

  useEffect(() => {
    setInternalValue(value)
    validate(value)
  }, [value])

  const validate = (ip: string) => {
    if (!ip) {
      setIsValid(true)
      return true
    }

    if (ipv6) {
      const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/
      const cidrPart = allowCIDR ? ip.split('/')[1] : null
      const ipPart = allowCIDR ? ip.split('/')[0] : ip

      const validIP = ipv6Regex.test(ipPart)
      const validCIDR = !allowCIDR || !cidrPart || (parseInt(cidrPart) >= 0 && parseInt(cidrPart) <= 128)

      setIsValid(validIP && validCIDR)
      return validIP && validCIDR
    } else {
      const ipv4Regex = /^((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])$/
      const cidrPart = allowCIDR ? ip.split('/')[1] : null
      const ipPart = allowCIDR ? ip.split('/')[0] : ip

      const validIP = ipv4Regex.test(ipPart)
      const validCIDR = !allowCIDR || !cidrPart || (parseInt(cidrPart) >= 0 && parseInt(cidrPart) <= 32)

      setIsValid(validIP && validCIDR)
      return validIP && validCIDR
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInternalValue(newValue)
    validate(newValue)
    onChange?.(newValue)
  }

  return (
    <div>
      <Input
        value={internalValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        status={(!isValid || error) ? 'error' : undefined}
        prefix={helpText && (
          <Tooltip title={helpText}>
            <InfoCircleOutlined />
          </Tooltip>
        )}
      />
      {!isValid && (
        <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 4 }}>
          Invalid {ipv6 ? 'IPv6' : 'IPv4'} address{allowCIDR ? ' or CIDR' : ''}
        </div>
      )}
    </div>
  )
}
