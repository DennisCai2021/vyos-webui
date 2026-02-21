/** Logs API service */
import apiClient from './client'
import type { LogEntry } from './types'

// Backend log entry response type
interface BackendLogEntry {
  timestamp: string
  level: string
  source: string
  message: string
  source_type: string
  process?: string
  pid?: number
  hostname?: string
  raw: string
}

// Transform backend log entry to frontend format
function transformLogEntry(backend: BackendLogEntry, index: number): LogEntry {
  return {
    id: String(index + 1),
    timestamp: backend.timestamp,
    facility: backend.source_type,
    level: backend.level,
    message: backend.message,
    interface: backend.source,
  }
}

export interface LogQueryParams {
  facility?: string
  level?: string
  interface?: string
  source_ip?: string
  limit?: number
  offset?: number
}

export const logsApi = {
  async query(params: LogQueryParams = {}): Promise<LogEntry[]> {
    // Use /logs/system endpoint for now
    const queryParams = new URLSearchParams()
    if (params.level && params.level !== 'all') {
      queryParams.append('level', params.level)
    }
    if (params.limit) {
      queryParams.append('limit', String(params.limit))
    }
    if (params.offset) {
      queryParams.append('offset', String(params.offset))
    }
    const queryString = queryParams.toString()
    const endpoint = params.facility && params.facility !== 'all'
      ? `/logs/${params.facility}${queryString ? '?' + queryString : ''}`
      : `/logs/system${queryString ? '?' + queryString : ''}`

    const data = await apiClient.get<BackendLogEntry[]>(endpoint)
    return data.map(transformLogEntry)
  },

  async getRecentLogs(limit: number = 100): Promise<LogEntry[]> {
    return this.query({ limit })
  },
}
