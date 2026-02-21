/* eslint-disable react-refresh/only-export-components */

/** Simple authentication context */

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { LoginRequest, LoginResponse } from '../types/index'
import apiClient from '../api/client'

// Enable this for development mode to bypass login
const DEV_MODE_BYPASS_AUTH = false

interface SimpleUser {
  username: string
}

interface AuthContextType {
  user: SimpleUser | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (credentials: LoginRequest) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<SimpleUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const isAuthenticated = !!user

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('username')
    setUser(null)
  }

  useEffect(() => {
    // Development mode: auto-login
    if (DEV_MODE_BYPASS_AUTH) {
      setUser({ username: 'dev' })
      setIsLoading(false)
      return
    }

    // Production mode: check localStorage
    const token = localStorage.getItem('access_token')
    if (token) {
      const username = localStorage.getItem('username')
      if (username) {
        setUser({ username })
      }
    }
    setIsLoading(false)
  }, [])

  const login = async (credentials: LoginRequest) => {
    // Development mode: bypass API
    if (DEV_MODE_BYPASS_AUTH) {
      localStorage.setItem('access_token', 'dev-token')
      localStorage.setItem('username', credentials.username)
      setUser({ username: credentials.username })
      return
    }

    console.log('Login attempt:', credentials.username)

    try {
      const response = await apiClient.post<LoginResponse>('/auth/login', credentials)
      console.log('Login response:', response)

      localStorage.setItem('access_token', response.access_token)
      localStorage.setItem('username', credentials.username)
      setUser({ username: credentials.username })
    } catch (error: any) {
      console.error('Login failed:', error)
      throw error
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
