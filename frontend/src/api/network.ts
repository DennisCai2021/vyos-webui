/** Network API service */
import apiClient from './client'
import type { NetworkInterface, Route, ARPEntry, DNSConfig, StaticRouteConfig, BGPConfig, BGPNeighbor, PrefixList, RouteMap, CommunityList, RouteMapRule, CommunityListRule, ISISConfig, ISISInterface, ISISRedistribute, PPPoEConfig, PPPoEStatus, PPPoEInterface, PPPoEInterfaceCreate, PPPoEInterfaceUpdate, RouteSummary } from './types'

// Backend interface response type
interface BackendInterface {
  name: string
  type: string
  description?: string
  status: string
  mtu: number
  mac_address?: string
  ip_addresses?: Array<{ address: string; gateway?: string }>
  vrf?: string
  speed?: string
  duplex?: string
  parent_interface?: string
  vlan_id?: number
}

// Backend route response type
interface BackendRoute {
  destination: string
  next_hop?: string
  interface?: string
  distance: number
  metric: number
  route_type: string
}

// Backend ARP response type
interface BackendARPEntry {
  ip_address: string
  mac_address: string
  interface: string
  age?: number
  state: string
}

// Backend DNS response type
interface BackendDNSConfig {
  domain_name?: string
  name_servers?: Array<{ server: string; vrf?: string; priority: number }>
}

// Transform backend interface to frontend format
function transformInterface(backend: BackendInterface): NetworkInterface {
  const primaryIp = backend.ip_addresses?.[0]?.address
  return {
    name: backend.name,
    type: backend.type,
    ip: primaryIp,
    status: backend.status === 'up' ? 'up' : 'down',
    speed: backend.speed,
    mtu: backend.mtu,
    mac_address: backend.mac_address,
    description: backend.description,
    duplex: backend.duplex as 'full' | 'half',
    ip_addresses: backend.ip_addresses?.map((ip) => {
      const [addr, cidrStr] = ip.address.split('/')
      return {
        address: addr,
        cidr: parseInt(cidrStr || '24'),
        gateway: ip.gateway,
      }
    }),
    dhcp: false,
    rx_bytes: 0,
    tx_bytes: 0,
    rx_rate: 0,
    tx_rate: 0,
    parent_interface: backend.parent_interface,
    vlan_id: backend.vlan_id,
  }
}

// Transform backend route to frontend format
function transformRoute(backend: BackendRoute, index: number): Route {
  return {
    id: String(index + 1),
    destination: backend.destination,
    gateway: backend.next_hop,
    interface: backend.interface,
    metric: backend.metric,
    distance: backend.distance,
    is_static: backend.route_type === 'static',
    is_connected: backend.route_type === 'connected',
  }
}

// Transform backend ARP entry to frontend format
function transformARPEntry(backend: BackendARPEntry): ARPEntry {
  return {
    ip_address: backend.ip_address,
    mac_address: backend.mac_address,
    interface: backend.interface,
    age: backend.age,
    type: backend.state === 'PERMANENT' ? 'static' : 'dynamic',
  }
}

// Transform backend DNS config to frontend format
function transformDNSConfig(backend: BackendDNSConfig): DNSConfig {
  return {
    nameservers: backend.name_servers?.map((ns) => ns.server) || [],
    forwarders: [],
    search_domains: backend.domain_name ? [backend.domain_name] : [],
    caching: true,
  }
}

export const networkApi = {
  async getInterfaces(): Promise<NetworkInterface[]> {
    const data = await apiClient.get<BackendInterface[]>('/network/interfaces')
    return data.map(transformInterface)
  },

  async getInterface(name: string): Promise<NetworkInterface> {
    const data = await apiClient.get<BackendInterface>(`/network/interfaces/${name}`)
    return transformInterface(data)
  },

  async createInterface(config: any): Promise<any> {
    return apiClient.post('/network/interfaces', config)
  },

  async updateInterface(name: string, config: any): Promise<any> {
    return apiClient.put(`/network/interfaces/${name}`, config)
  },

  async deleteInterface(name: string): Promise<void> {
    return apiClient.delete(`/network/interfaces/${name}`)
  },

  async getRoutes(): Promise<Route[]> {
    const data = await apiClient.get<BackendRoute[]>('/network/routes')
    return data.map(transformRoute)
  },

  async addRoute(route: StaticRouteConfig): Promise<Route> {
    const result = await apiClient.post<Route>('/network/routes', route)
    return result
  },

  async deleteRoute(destination: string, next_hop?: string): Promise<void> {
    let url = `/network/routes/${encodeURIComponent(destination)}`
    if (next_hop) {
      url += `?next_hop=${encodeURIComponent(next_hop)}`
    }
    return apiClient.delete(url)
  },

  async getRoutesSummary(): Promise<RouteSummary[]> {
    return apiClient.get<RouteSummary[]>('/network/routes/summary')
  },

  async getARPTable(): Promise<ARPEntry[]> {
    const data = await apiClient.get<BackendARPEntry[]>('/network/arp-table')
    return data.map(transformARPEntry)
  },

  async flushARPTable(interfaceName?: string): Promise<void> {
    let url = '/network/arp-table'
    if (interfaceName) {
      url += `?interface=${encodeURIComponent(interfaceName)}`
    }
    return apiClient.delete(url)
  },

  async getDNSConfig(): Promise<DNSConfig> {
    const data = await apiClient.get<BackendDNSConfig>('/network/dns')
    return transformDNSConfig(data)
  },

  async updateDNSConfig(config: Partial<DNSConfig>): Promise<DNSConfig> {
    if (config.nameservers) {
      await apiClient.put('/network/dns/servers', { servers: config.nameservers })
    }
    return this.getDNSConfig()
  },

  // === VLAN Interface API ===

  async createVLANInterface(vlan: {
    name: string
    parent_interface: string
    vlan_id: number
    description?: string
    mtu?: number
  }): Promise<any> {
    return apiClient.post('/network/interfaces/vlan', vlan)
  },

  async updateVLANInterface(name: string, vlan: {
    description?: string
    mtu?: number
  }): Promise<any> {
    return apiClient.put(`/network/interfaces/vlan/${name}`, vlan)
  },

  async deleteVLANInterface(name: string): Promise<any> {
    return apiClient.delete(`/network/interfaces/vlan/${name}`)
  },

  async addIPToVLAN(name: string, address: string): Promise<any> {
    return apiClient.post(`/network/interfaces/vlan/${name}/ip-addresses`, { address })
  },

  async removeIPFromVLAN(name: string, address: string): Promise<any> {
    return apiClient.delete(`/network/interfaces/vlan/${name}/ip-addresses/${encodeURIComponent(address)}`)
  },

  // === BGP API ===

  async getBGPConfig(): Promise<BGPConfig> {
    return apiClient.get<BGPConfig>('/bgp/config')
  },

  async updateBGPConfig(config: {
    local_as: number
    router_id?: string
    keepalive?: number
    holdtime?: number
  }): Promise<any> {
    return apiClient.put('/bgp/config', config)
  },

  async createBGPNeighbor(neighbor: {
    ip_address: string
    remote_as: number
    description?: string
    update_source?: string
    next_hop_self?: boolean
    password?: string
    advertisement_interval?: number
    ebgp_multihop?: number
    prefix_list_in?: string
    prefix_list_out?: string
    route_map_in?: string
    route_map_out?: string
  }): Promise<any> {
    return apiClient.post('/bgp/neighbors', neighbor)
  },

  async updateBGPNeighbor(ip_address: string, neighbor: {
    description?: string
    update_source?: string
    next_hop_self?: boolean
    password?: string
    advertisement_interval?: number
    ebgp_multihop?: number
    prefix_list_in?: string
    prefix_list_out?: string
    route_map_in?: string
    route_map_out?: string
  }): Promise<any> {
    return apiClient.put(`/bgp/neighbors/${ip_address}`, neighbor)
  },

  async deleteBGPNeighbor(ip_address: string): Promise<any> {
    return apiClient.delete(`/bgp/neighbors/${ip_address}`)
  },

  async addBGPNetwork(network: string): Promise<any> {
    return apiClient.post('/bgp/networks', { network })
  },

  async deleteBGPNetwork(network: string): Promise<any> {
    return apiClient.delete(`/bgp/networks/${encodeURIComponent(network)}`)
  },

  // === Prefix List API ===

  async getPrefixLists(): Promise<PrefixList[]> {
    const result = await apiClient.get<{ prefix_lists: PrefixList[] }>('/bgp/prefix-lists')
    return result.prefix_lists
  },

  async createPrefixList(name: string): Promise<any> {
    return apiClient.post(`/bgp/prefix-lists?name=${encodeURIComponent(name)}`)
  },

  async deletePrefixList(name: string): Promise<any> {
    return apiClient.delete(`/bgp/prefix-lists/${encodeURIComponent(name)}`)
  },

  async addPrefixListRule(name: string, rule: {
    sequence: number
    action: string
    prefix: string
    ge?: number
    le?: number
  }): Promise<any> {
    return apiClient.post(`/bgp/prefix-lists/${encodeURIComponent(name)}/rules`, rule)
  },

  async deletePrefixListRule(name: string, sequence: number): Promise<any> {
    return apiClient.delete(`/bgp/prefix-lists/${encodeURIComponent(name)}/rules/${sequence}`)
  },

  // === Route Map API ===

  async getRouteMaps(): Promise<RouteMap[]> {
    const result = await apiClient.get<{ route_maps: RouteMap[] }>('/bgp/route-maps')
    return result.route_maps
  },

  async createRouteMap(name: string): Promise<any> {
    return apiClient.post(`/bgp/route-maps?name=${encodeURIComponent(name)}`)
  },

  async deleteRouteMap(name: string): Promise<any> {
    return apiClient.delete(`/bgp/route-maps/${encodeURIComponent(name)}`)
  },

  async addRouteMapRule(name: string, rule: RouteMapRule): Promise<any> {
    return apiClient.post(`/bgp/route-maps/${encodeURIComponent(name)}/rules`, rule)
  },

  async deleteRouteMapRule(name: string, sequence: number): Promise<any> {
    return apiClient.delete(`/bgp/route-maps/${encodeURIComponent(name)}/rules/${sequence}`)
  },

  // === Community List API ===

  async getCommunityLists(): Promise<CommunityList[]> {
    const result = await apiClient.get<{ community_lists: CommunityList[] }>('/bgp/community-lists')
    return result.community_lists
  },

  async createCommunityList(name: string, type: 'standard' | 'expanded'): Promise<any> {
    return apiClient.post(`/bgp/community-lists?name=${encodeURIComponent(name)}&type=${type}`)
  },

  async deleteCommunityList(name: string): Promise<any> {
    return apiClient.delete(`/bgp/community-lists/${encodeURIComponent(name)}`)
  },

  async addCommunityListRule(name: string, rule: CommunityListRule): Promise<any> {
    return apiClient.post(`/bgp/community-lists/${encodeURIComponent(name)}/rules`, rule)
  },

  async deleteCommunityListRule(name: string, sequence: number): Promise<any> {
    return apiClient.delete(`/bgp/community-lists/${encodeURIComponent(name)}/rules/${sequence}`)
  },

  // === BGP Summary API ===

  async getBGPSummary(): Promise<any> {
    return apiClient.get('/bgp/summary')
  },

  // === IS-IS API ===

  async getISISConfig(): Promise<ISISConfig> {
    return apiClient.get<ISISConfig>('/isis/config')
  },

  async setupISIS(config: {
    net: string
    level?: string
    metric_style?: string
    interface: string
    interface_circuit_type?: string
    interface_metric?: number
    interface_passive: boolean
  }): Promise<any> {
    return apiClient.post('/isis/setup', config)
  },

  async updateISISConfig(config: {
    net?: string
    level?: string
    metric_style?: string
    purge_originator?: boolean
    set_overload_bit?: boolean
    spf_interval?: number
  }): Promise<any> {
    return apiClient.put('/isis/config', config)
  },

  async disableISIS(): Promise<any> {
    return apiClient.delete('/isis/config')
  },

  async addISISInterface(iface: {
    interface: string
    circuit_type?: string
    hello_interval?: number
    hello_multiplier?: number
    metric?: number
    passive?: boolean
    priority?: number
  }): Promise<any> {
    return apiClient.post('/isis/interfaces', iface)
  },

  async updateISISInterface(interfaceName: string, iface: {
    circuit_type?: string
    hello_interval?: number
    hello_multiplier?: number
    metric?: number
    passive?: boolean
    priority?: number
  }): Promise<any> {
    return apiClient.put(`/isis/interfaces/${encodeURIComponent(interfaceName)}`, iface)
  },

  async deleteISISInterface(interfaceName: string): Promise<any> {
    return apiClient.delete(`/isis/interfaces/${encodeURIComponent(interfaceName)}`)
  },

  async addISISRedistribute(redist: {
    source: string
    level: string
    route_map?: string
  }): Promise<any> {
    return apiClient.post('/isis/redistribute', redist)
  },

  async deleteISISRedistribute(source: string, level: string): Promise<any> {
    return apiClient.delete(`/isis/redistribute/${encodeURIComponent(source)}/${encodeURIComponent(level)}`)
  },

  async getISISStatus(): Promise<any> {
    return apiClient.get('/isis/status')
  },

  // === PPPoE API ===

  async getPPPoEConfig(): Promise<PPPoEConfig> {
    return apiClient.get<PPPoEConfig>('/network/interfaces/pppoe')
  },

  async getPPPoEStatus(): Promise<PPPoEStatus> {
    return apiClient.get<PPPoEStatus>('/network/interfaces/pppoe/status')
  },

  async createPPPoEInterface(pppoe: PPPoEInterfaceCreate): Promise<any> {
    return apiClient.post('/network/interfaces/pppoe', pppoe)
  },

  async updatePPPoEInterface(name: string, pppoe: PPPoEInterfaceUpdate): Promise<any> {
    return apiClient.put(`/network/interfaces/pppoe/${name}`, pppoe)
  },

  async deletePPPoEInterface(name: string): Promise<any> {
    return apiClient.delete(`/network/interfaces/pppoe/${name}`)
  },
}
