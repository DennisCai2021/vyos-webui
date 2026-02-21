/** Firewall API service */
import apiClient from './client'
import type {
  FirewallRule,
  NATRule,
  AddressGroup,
  ServiceGroup,
  FirewallStatistics,
} from './types'

// Backend firewall rule response type
interface BackendFirewallRule {
  name: string
  direction: string
  action: string
  sequence: number
  description?: string
  enabled: boolean
  source_address?: string
  source_port?: number
  source_port_range?: string
  destination_address?: string
  destination_port?: number
  destination_port_range?: string
  protocol?: string
  state?: string[]
  interface?: string
  log: boolean
  log_prefix?: string
}

// Backend NAT rule response type
interface BackendNATRule {
  name: string
  type: string
  sequence: number
  order?: number
  description?: string
  enabled: boolean
  source_address?: string
  source_port?: string
  destination_address?: string
  destination_port?: string
  inbound_interface?: string
  outbound_interface?: string
  translation_address?: string
  translation_port?: string
  port?: number
  port_range?: string
  protocol?: string
  log: boolean
}

// Transform backend rule to frontend format
function transformFirewallRule(backend: BackendFirewallRule, index: number): FirewallRule {
  return {
    id: String(index + 1),
    name: backend.name,
    action: backend.action as 'accept' | 'drop' | 'reject',
    source: backend.source_address || 'any',
    source_port: backend.source_port?.toString() || backend.source_port_range,
    destination: backend.destination_address || 'any',
    destination_port: backend.destination_port?.toString() || backend.destination_port_range,
    protocol: (backend.protocol || 'any') as 'tcp' | 'udp' | 'icmp' | 'any',
    enabled: backend.enabled,
    log: backend.log,
    comment: backend.description,
    order: backend.sequence,
  }
}

// Transform backend NAT rule to frontend format
function transformNATRule(backend: BackendNATRule, index: number): NATRule {
  return {
    id: String(backend.sequence || index + 1),
    name: backend.name,
    type: backend.type as 'source' | 'destination' | 'masquerade',
    sequence: backend.sequence,
    order: backend.order || backend.sequence,
    description: backend.description,
    source_address: backend.source_address,
    source_port: backend.source_port,
    destination_address: backend.destination_address,
    destination_port: backend.destination_port,
    inbound_interface: backend.inbound_interface,
    outbound_interface: backend.outbound_interface,
    translation_address: backend.translation_address,
    translation_port: backend.translation_port || backend.port?.toString() || backend.port_range,
    protocol: backend.protocol,
    enabled: backend.enabled,
    log: backend.log,
  }
}

export const firewallApi = {
  async getRules(): Promise<FirewallRule[]> {
    const data = await apiClient.get<BackendFirewallRule[]>('/firewall/rules')
    return data.map(transformFirewallRule)
  },

  async addRule(rule: Omit<FirewallRule, 'id'>): Promise<FirewallRule> {
    return apiClient.post<FirewallRule>('/firewall/rules', rule)
  },

  async updateRule(id: string, rule: Partial<FirewallRule>): Promise<FirewallRule> {
    return apiClient.put<FirewallRule>(`/firewall/rules/${id}`, rule)
  },

  async deleteRule(id: string): Promise<void> {
    return apiClient.delete<void>(`/firewall/rules/${id}`)
  },

  async toggleRule(id: string, enabled: boolean): Promise<FirewallRule> {
    return apiClient.patch<FirewallRule>(`/firewall/rules/${id}`, { enabled })
  },

  async reorderRules(ruleIds: string[]): Promise<void> {
    return apiClient.post<void>('/firewall/rules/reorder', { rule_ids: ruleIds })
  },

  async getNATRules(): Promise<NATRule[]> {
    const data = await apiClient.get<BackendNATRule[]>('/firewall/nat/rules')
    return data.map(transformNATRule)
  },

  async addNATRule(rule: Omit<NATRule, 'id'>): Promise<NATRule> {
    return apiClient.post<NATRule>('/firewall/nat/rules', rule)
  },

  async updateNATRule(id: string, rule: Partial<NATRule>): Promise<NATRule> {
    return apiClient.put<NATRule>(`/firewall/nat/rules/${id}`, rule)
  },

  async deleteNATRule(id: string): Promise<void> {
    return apiClient.delete<void>(`/firewall/nat/rules/${id}`)
  },

  async toggleNATRule(id: string, enabled: boolean): Promise<NATRule> {
    return apiClient.patch<NATRule>(`/firewall/nat/rules/${id}`, { enabled })
  },

  async getAddressGroups(): Promise<AddressGroup[]> {
    return apiClient.get<AddressGroup[]>('/firewall/address-groups')
  },

  async addAddressGroup(group: Omit<AddressGroup, 'id'>): Promise<AddressGroup> {
    return apiClient.post<AddressGroup>('/firewall/address-groups', group)
  },

  async updateAddressGroup(id: string, group: Partial<AddressGroup>): Promise<AddressGroup> {
    return apiClient.put<AddressGroup>(`/firewall/address-groups/${id}`, group)
  },

  async deleteAddressGroup(id: string): Promise<void> {
    return apiClient.delete<void>(`/firewall/address-groups/${id}`)
  },

  async getServiceGroups(): Promise<ServiceGroup[]> {
    return apiClient.get<ServiceGroup[]>('/firewall/service-groups')
  },

  async addServiceGroup(group: Omit<ServiceGroup, 'id'>): Promise<ServiceGroup> {
    return apiClient.post<ServiceGroup>('/firewall/service-groups', group)
  },

  async updateServiceGroup(id: string, group: Partial<ServiceGroup>): Promise<ServiceGroup> {
    return apiClient.put<ServiceGroup>(`/firewall/service-groups/${id}`, group)
  },

  async deleteServiceGroup(id: string): Promise<void> {
    return apiClient.delete<void>(`/firewall/service-groups/${id}`)
  },

  async getStatistics(): Promise<FirewallStatistics> {
    return apiClient.get<FirewallStatistics>('/firewall/statistics')
  },
}
