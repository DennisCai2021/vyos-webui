/** VPN API service */
import apiClient from './client'
import type {
  WireGuardInterface,
  WireGuardInterfaceCreate,
  WireGuardInterfaceUpdate,
  WireGuardPeerAdd,
  VPNStatistics,
  VPNTrafficStats,
  IPsecPeer,
  IPsecTunnel,
  IPsecPeerCreate,
  IPsecTunnelAdd,
  IPsecConfig,
  OpenVPNInstance,
  OpenVPNCreate,
  OpenVPNConfig,
} from './types'

// Backend types
interface BackendWireGuardInterface {
  name: string
  address?: string
  private_key?: string
  public_key?: string
  listen_port?: number
  mtu: number
  description?: string
  peers: BackendWireGuardPeer[]
}

interface BackendWireGuardPeer {
  name: string
  public_key: string
  endpoint?: string
  allowed_ips?: string
  persistent_keepalive: number
  enabled: boolean
}

interface BackendTunnelStatus {
  name: string
  type: string
  status: string
  uptime: number
  bytes_in: number
  bytes_out: number
  error?: string
}

// Transform functions
function transformWireGuard(backend: BackendWireGuardInterface, index: number): WireGuardInterface {
  return {
    id: String(index + 1),
    name: backend.name,
    private_key: backend.private_key || '',
    public_key: backend.public_key,
    listen_port: backend.listen_port,
    enabled: true,
    status: 'inactive',
    address: backend.address,
    peers: backend.peers.map((p, i) => ({
      id: String(i + 1),
      name: p.name,
      public_key: p.public_key,
      allowed_ips: p.allowed_ips ? [p.allowed_ips] : [],
      endpoint: p.endpoint,
      enabled: p.enabled,
      status: 'disconnected',
      persistent_keepalive: p.persistent_keepalive,
    })),
    mtu: backend.mtu,
    description: backend.description,
  }
}

export const vpnApi = {
  // WireGuard
  async getWireGuardInterfaces(): Promise<WireGuardInterface[]> {
    const data = await apiClient.get<BackendWireGuardInterface[]>('/vpn/wireguard/interfaces')
    return data.map(transformWireGuard)
  },

  async getWireGuardConfig(): Promise<{ interfaces: WireGuardInterface[] }> {
    const data = await apiClient.get<{ interfaces: BackendWireGuardInterface[] }>('/vpn/wireguard/config')
    return {
      interfaces: data.interfaces.map(transformWireGuard),
    }
  },

  async getWireGuardStatus(): Promise<any> {
    return apiClient.get<any>('/vpn/wireguard/status')
  },

  async createWireGuardInterface(data: WireGuardInterfaceCreate): Promise<any> {
    return apiClient.post<any>('/vpn/wireguard/interfaces', data)
  },

  async updateWireGuardInterface(name: string, data: WireGuardInterfaceUpdate): Promise<any> {
    return apiClient.put<any>(`/vpn/wireguard/interfaces/${name}`, data)
  },

  async deleteWireGuardInterface(name: string): Promise<void> {
    return apiClient.delete<void>(`/vpn/wireguard/interfaces/${name}`)
  },

  async addWireGuardPeer(interfaceName: string, data: WireGuardPeerAdd): Promise<any> {
    return apiClient.post<any>(`/vpn/wireguard/interfaces/${interfaceName}/peers`, data)
  },

  async removeWireGuardPeer(interfaceName: string, peerName: string): Promise<void> {
    return apiClient.delete<void>(`/vpn/wireguard/interfaces/${interfaceName}/peers/${peerName}`)
  },

  // General VPN
  async getVPNStatistics(): Promise<VPNStatistics> {
    try {
      const statuses = await apiClient.get<BackendTunnelStatus[]>('/vpn/tunnels/status')
      const active = statuses.filter(s => s.status === 'connected' || s.status === 'active')
      return {
        total_tunnels: statuses.length,
        active_tunnels: active.length,
        ipsec_tunnels: statuses.filter(s => s.type === 'ipsec').length,
        openvpn_tunnels: statuses.filter(s => s.type === 'openvpn').length,
        wireguard_tunnels: statuses.filter(s => s.type === 'wireguard').length,
        total_bytes_in: statuses.reduce((sum, s) => sum + s.bytes_in, 0),
        total_bytes_out: statuses.reduce((sum, s) => sum + s.bytes_out, 0),
      }
    } catch {
      return {
        total_tunnels: 0,
        active_tunnels: 0,
        ipsec_tunnels: 0,
        openvpn_tunnels: 0,
        wireguard_tunnels: 0,
        total_bytes_in: 0,
        total_bytes_out: 0,
      }
    }
  },

  async getVPNTrafficStats(_hours: number = 24): Promise<VPNTrafficStats[]> {
    // Traffic stats endpoint not implemented yet, return empty
    return []
  },

  // IPsec API
  async getIPsecConfig(): Promise<IPsecConfig> {
    return apiClient.get<IPsecConfig>('/vpn/ipsec/config')
  },

  async getIPsecStatus(): Promise<any> {
    return apiClient.get<any>('/vpn/ipsec/status')
  },

  async createIPsecPeer(data: IPsecPeerCreate): Promise<any> {
    return apiClient.post<any>('/vpn/ipsec/peers', data)
  },

  async deleteIPsecPeer(name: string): Promise<void> {
    return apiClient.delete<void>(`/vpn/ipsec/peers/${name}`)
  },

  async addIPsecTunnelToPeer(peerName: string, data: IPsecTunnelAdd): Promise<any> {
    return apiClient.post<any>(`/vpn/ipsec/peers/${peerName}/tunnels`, data)
  },

  // OpenVPN API
  async getOpenVPNConfig(): Promise<OpenVPNConfig> {
    return apiClient.get<OpenVPNConfig>('/vpn/openvpn/config')
  },

  async createOpenVPNInstance(data: OpenVPNCreate): Promise<any> {
    return apiClient.post<any>('/vpn/openvpn/instances', data)
  },

  async deleteOpenVPNInstance(name: string): Promise<void> {
    return apiClient.delete<void>(`/vpn/openvpn/instances/${name}`)
  },
}
