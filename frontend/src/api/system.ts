/** System API service */
import apiClient from './client'
import type { SystemInfo, HardwareInfo, UptimeInfo, ServiceStatus, VersionResponse } from './types'

export const FRONTEND_VERSION = '0.0.1-20250221'

export const systemApi = {
  async getInfo(): Promise<SystemInfo> {
    return apiClient.get<SystemInfo>('/system/info')
  },

  async getVersion(): Promise<VersionResponse> {
    return apiClient.get<VersionResponse>('/version')
  },

  async getHardwareInfo(): Promise<HardwareInfo> {
    return apiClient.get<HardwareInfo>('/system/hardware')
  },

  async getUptime(): Promise<UptimeInfo> {
    return apiClient.get<UptimeInfo>('/system/uptime')
  },

  async getServices(serviceName?: string): Promise<ServiceStatus[]> {
    const query = serviceName ? `?service_name=${serviceName}` : ''
    return apiClient.get<ServiceStatus[]>(`/system/services${query}`)
  },
}
