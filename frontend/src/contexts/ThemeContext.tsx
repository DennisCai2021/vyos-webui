/* eslint-disable react-refresh/only-export-components */

/** Theme context provider */

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { defaultTheme, getThemeColors } from '../types/theme'
import type { Theme, ThemeMode } from '../types/theme'

interface ThemeContextType {
  theme: Theme
  setTheme: (updates: Partial<Theme>) => void
  toggleMode: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

interface ThemeProviderProps {
  children: ReactNode
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Load theme from localStorage
    const savedMode = localStorage.getItem('theme-mode') as ThemeMode
    return {
      ...defaultTheme,
      mode: savedMode || defaultTheme.mode,
    }
  })

  useEffect(() => {
    // Apply theme to document
    const colors = getThemeColors(theme.mode)

    // Update CSS variables
    document.documentElement.style.setProperty('--color-primary', colors.primary)
    document.documentElement.style.setProperty('--color-text', colors.text)
    document.documentElement.style.setProperty('--color-text-secondary', colors.textSecondary)
    document.documentElement.style.setProperty('--color-background', colors.background)
    document.documentElement.style.setProperty('--color-background-lighter', colors.backgroundLighter)
    document.documentElement.style.setProperty('--color-border', colors.border)
    document.documentElement.style.setProperty('--color-success', colors.success)
    document.documentElement.style.setProperty('--color-warning', colors.warning)
    document.documentElement.style.setProperty('--color-error', colors.error)

    // Add or remove dark class
    if (theme.mode === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  const setTheme = (updates: Partial<Theme>) => {
    setThemeState((prev) => {
      const newTheme = { ...prev, ...updates }

      // Save mode to localStorage
      if (updates.mode) {
        localStorage.setItem('theme-mode', updates.mode)
      }

      return newTheme
    })
  }

  const toggleMode = () => {
    const newMode: ThemeMode = theme.mode === 'light' ? 'dark' : 'light'
    setTheme({ mode: newMode })
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  )
}
