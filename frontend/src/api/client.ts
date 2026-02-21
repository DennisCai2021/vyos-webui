/** Simple API client configuration */
// Auto-detect API base URL from current window location
function getApiBaseUrl(): string {
  // Allow override via environment variable
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL
  }
  // If in browser, check if we're being served from the same port as the API
  if (typeof window !== 'undefined') {
    // If we're on port 8000, assume API is on the same origin (relative path)
    if (window.location.port === '8000') {
      return ''
    }
    // Otherwise use same host but port 8000
    const protocol = window.location.protocol
    const hostname = window.location.hostname
    return `${protocol}//${hostname}:8000`
  }
  // Fallback for development
  return 'http://localhost:8000'
}

const API_BASE_URL = getApiBaseUrl()
const API_PREFIX = '/api/v1'

const baseURL = API_BASE_URL + API_PREFIX

// Timeout configuration: 120 seconds for write operations, 30 seconds for read
const READ_TIMEOUT = 30000
const WRITE_TIMEOUT = 120000

export const apiClient = {
  baseURL,

  async get<T>(endpoint: string): Promise<T> {
    console.log('GET:', baseURL + endpoint)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), READ_TIMEOUT)

    try {
      const response = await fetch(baseURL + endpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('access_token') || ''}`,
        },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return this.handleResponse<T>(response)
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  },

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    console.log('POST:', baseURL + endpoint, data)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), WRITE_TIMEOUT)

    try {
      const response = await fetch(baseURL + endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('access_token') || ''}`,
        },
        body: data ? JSON.stringify(data) : undefined,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return this.handleResponse<T>(response)
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  },

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    console.log('PUT:', baseURL + endpoint, data)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), WRITE_TIMEOUT)

    try {
      const response = await fetch(baseURL + endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('access_token') || ''}`,
        },
        body: data ? JSON.stringify(data) : undefined,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return this.handleResponse<T>(response)
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  },

  async delete<T>(endpoint: string): Promise<T> {
    console.log('DELETE:', baseURL + endpoint)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), WRITE_TIMEOUT)

    try {
      const response = await fetch(baseURL + endpoint, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('access_token') || ''}`,
        },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return this.handleResponse<T>(response)
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  },

  async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    console.log('PATCH:', baseURL + endpoint, data)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), WRITE_TIMEOUT)

    try {
      const response = await fetch(baseURL + endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('access_token') || ''}`,
        },
        body: data ? JSON.stringify(data) : undefined,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return this.handleResponse<T>(response)
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  },

  async handleResponse<T>(response: Response): Promise<T> {
    console.log('Response status:', response.status, response.statusText)
    if (!response.ok) {
      let errorMsg = response.statusText
      try {
        const error = await response.json()
        console.log('Error response:', error)
        errorMsg = error.detail || error.message || response.statusText
      } catch {
        // Ignore JSON parse error
      }
      throw new Error(errorMsg)
    }
    const result = await response.json()
    console.log('Response data:', result)
    return result
  },
}

export default apiClient
