/** Port Input Component */

import { useState, useEffect } from 'react'
import { Input, Select } from 'antd'

const { Option } = Select

interface PortInputProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  error?: boolean
  allowRange?: boolean
  allowProtocol?: boolean
}

export function PortInput({
  value = '',
  onChange,
  placeholder = '80',
  disabled = false,
  error = false,
  allowRange = false,
  allowProtocol = false,
}: PortInputProps) {
  const [internalValue, setInternalValue] = useState(value)
  const [isValid, setIsValid] = useState(true)

  useEffect(() => {
    setInternalValue(value)
    validate(value)
  }, [value])

  const validate = (portStr: string) => {
    if (!portStr) {
      setIsValid(true)
      return true
    }

    if (allowRange && portStr.includes('-')) {
      const [start, end] = portStr.split('-').map(p => parseInt(p.trim()))
      const valid = !isNaN(start) && !isNaN(end) && start > 0 && end <= 65535 && start <= end
      setIsValid(valid)
      return valid
    }

    const port = parseInt(portStr)
    const valid = !isNaN(port) && port > 0 && port <= 65535
    setIsValid(valid)
    return valid
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInternalValue(newValue)
    validate(newValue)
    onChange?.(newValue)
  }

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {allowProtocol && (
        <Select defaultValue="tcp" style={{ width: 100 }} disabled={disabled}>
          <Option value="tcp">TCP</Option>
          <Option value="udp">UDP</Option>
          <Option value="any">ANY</Option>
        </Select>
      )}
      <Input
        value={internalValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        status={(!isValid || error) ? 'error' : undefined}
      />
    </div>
  )
}
