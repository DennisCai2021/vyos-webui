/** Simple API client configuration */

const API_PREFIX = '/api/v1'

// Timeout configuration: 120 seconds for write operations, 30 seconds for read
const READ_TIMEOUT = 30000
const WRITE_TIMEOUT = 120000

export const apiClient = {
  baseURL: API_PREFIX,

  async get<T>(endpoint: string): Promise<T> {
    const url = API_PREFIX + endpoint
    console.log('GET:', url)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), READ_TIMEOUT)

    try {
      const response = await fetch(url, {
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
    const url = API_PREFIX + endpoint
    console.log('POST:', url, data)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), WRITE_TIMEOUT)

    try {
      const response = await fetch(url, {
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
    const url = API_PREFIX + endpoint
    console.log('PUT:', url, data)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), WRITE_TIMEOUT)

    try {
      const response = await fetch(url, {
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
    const url = API_PREFIX + endpoint
    console.log('DELETE:', url)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), WRITE_TIMEOUT)

    try {
      const response = await fetch(url, {
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
    const url = API_PREFIX + endpoint
    console.log('PATCH:', url, data)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), WRITE_TIMEOUT)

    try {
      const response = await fetch(url, {
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
