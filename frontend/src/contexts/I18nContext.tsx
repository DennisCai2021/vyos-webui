/* eslint-disable react-refresh/only-export-components */

/** Internationalization (i18n) context provider */

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import en from '../locales/en.json'
import zh from '../locales/zh.json'

export type Locale = 'en' | 'zh'

const locales = { en, zh }

interface I18nContextType {
  locale: Locale
  t: (path: string, params?: Record<string, string | number>) => string
  setLocale: (locale: Locale) => void
  availableLocales: readonly Locale[]
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

const getNestedValue = (obj: any, path: string): string | undefined => {
  const keys = path.split('.')
  let result = obj
  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = result[key]
    } else {
      return undefined
    }
  }
  return typeof result === 'string' ? result : undefined
}

export const useI18n = () => {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return context
}

interface I18nProviderProps {
  children: ReactNode
}

export const I18nProvider: React.FC<I18nProviderProps> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('locale') as Locale
    return saved && saved in locales ? saved : 'zh'
  })

  useEffect(() => {
    localStorage.setItem('locale', locale)
  }, [locale])

  const t = (path: string, params?: Record<string, string | number>): string => {
    let value = getNestedValue(locales[locale], path)

    // Fallback to English if translation not found in current locale
    if (!value && locale !== 'en') {
      value = getNestedValue(locales.en, path)
    }

    if (!value) {
      console.warn(`Translation not found: ${path}`)
      return path
    }

    if (params) {
      return value.replace(/\{(\w+)\}/g, (match, key) => {
        return params[key]?.toString() || match
      })
    }

    return value
  }

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale)
  }

  return (
    <I18nContext.Provider
      value={{
        locale,
        t,
        setLocale,
        availableLocales: ['en', 'zh'] as const,
      }}
    >
      {children}
    </I18nContext.Provider>
  )
}
