/** MAC Address Input Component */

import { useState, useEffect } from 'react'
import { Input } from 'antd'

interface MACAddressInputProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  error?: boolean
}

export function MACAddressInput({
  value = '',
  onChange,
  placeholder = '00:11:22:33:44:55',
  disabled = false,
  error = false,
}: MACAddressInputProps) {
  const [internalValue, setInternalValue] = useState(value)
  const [isValid, setIsValid] = useState(true)

  useEffect(() => {
    setInternalValue(value)
    validate(value)
  }, [value])

  const validate = (mac: string) => {
    if (!mac) {
      setIsValid(true)
      return true
    }

    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$|^([0-9A-Fa-f]{4}[:.]){2}([0-9A-Fa-f]{4})$/
    setIsValid(macRegex.test(mac))
    return macRegex.test(mac)
  }

  const formatMAC = (mac: string) => {
    const clean = mac.replace(/[^0-9A-Fa-f]/g, '')
    const parts = []
    for (let i = 0; i < clean.length && i < 12; i += 2) {
      parts.push(clean.slice(i, i + 2))
    }
    return parts.join(':')
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInternalValue(newValue)
    validate(newValue)
    onChange?.(newValue)
  }

  const handleBlur = () => {
    const formatted = formatMAC(internalValue)
    setInternalValue(formatted)
    validate(formatted)
    onChange?.(formatted)
  }

  return (
    <Input
      value={internalValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      disabled={disabled}
      status={(!isValid || error) ? 'error' : undefined}
    />
  )
}
