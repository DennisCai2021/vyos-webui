/** API response types */

export interface VersionResponse {
  backend_version: string
}

export interface SystemInfo {
  version: {
    version: string
    build_date: string
    description: string
    kernel: string
    architecture: string
    serial_number?: string
  }
  hardware: HardwareInfo
  uptime: UptimeInfo
}

export interface HardwareInfo {
  cpu_model?: string
  cpu_cores?: number
  cpu_speed?: string
  memory_total?: number
  memory_used?: number
  memory_free?: number
  disk_total?: number
  disk_used?: number
  disk_free?: number
}

export interface UptimeInfo {
  uptime_seconds: number
  uptime_string: string
  load_average_1m: number
  load_average_5m: number
  load_average_15m: number
  load_average?: number[]
}

export interface NetworkInterface {
  name: string
  type?: string
  ip?: string
  status: 'up' | 'down'
  speed?: string
  rx_bytes?: number
  tx_bytes?: number
  rx_rate?: number
  tx_rate?: number
  mtu?: number
  mac_address?: string
  description?: string
  duplex?: 'full' | 'half'
  ip_addresses?: InterfaceIP[]
  dhcp?: boolean
  ipv6?: string
  vrf?: string
  // For VLAN interfaces
  parent_interface?: string
  vlan_id?: number
}

export interface VLANInterface {
  name: string
  parent_interface: string
  vlan_id: number
  description?: string
  mtu?: number
}

export interface VLANInterfaceUpdate {
  description?: string
  mtu?: number
}

export interface InterfaceIP {
  address: string
  cidr: number
  gateway?: string
  dhcp?: boolean
}

export interface Route {
  id: string
  destination: string
  gateway?: string
  interface?: string
  metric?: number
  is_static: boolean
  is_connected: boolean
  distance?: number
}

export interface RouteSummary {
  destination: string
  next_hop?: string
  interface?: string
  route_type: string
  route_source: string
  is_selected: boolean
  is_fib: boolean
  is_queued: boolean
  is_rejected: boolean
  is_backup: boolean
  is_trapped: boolean
  is_offload_failure: boolean
  age?: string
  distance: number
  metric: number
  status: string
}

export interface ARPEntry {
  ip_address: string
  mac_address: string
  interface: string
  age?: number
  type: 'static' | 'dynamic'
}

export interface DNSConfig {
  nameservers: string[]
  forwarders: string[]
  search_domains: string[]
  caching: boolean
  listening_address?: string
}

export interface StaticRouteConfig {
  destination: string
  next_hop?: string
  interface?: string
  distance?: number
  disable?: boolean
  description?: string
}

export interface FirewallRule {
  id: string
  name?: string
  direction: 'in' | 'out' | 'forward'
  action: 'accept' | 'drop' | 'reject'
  source?: string
  source_port?: string
  destination?: string
  destination_port?: string
  protocol: 'tcp' | 'udp' | 'icmp' | 'any'
  enabled: boolean
  log?: boolean
  description?: string
  comment?: string
  order: number
}

export interface NATRule {
  id: string
  name?: string
  type: 'source' | 'destination' | 'masquerade'
  sequence: number
  order?: number
  description?: string
  source_address?: string
  source_port?: string
  destination_address?: string
  destination_port?: string
  inbound_interface?: string
  outbound_interface?: string
  translation_address?: string
  translation_port?: string
  protocol?: string
  enabled: boolean
  log?: boolean
}

export interface AddressGroup {
  id: string
  name: string
  type: 'ipv4' | 'ipv6' | 'network'
  members: string[]
  comment?: string
}

export interface ServiceGroup {
  id: string
  name: string
  members: ServiceMember[]
  comment?: string
}

export interface ServiceMember {
  protocol: 'tcp' | 'udp'
  port: string
}

export interface FirewallStatistics {
  total_rules: number
  enabled_rules: number
  disabled_rules: number
  total_nat_rules: number
  address_groups: number
  service_groups: number
}

export interface LogEntry {
  id: string
  timestamp: string
  facility: string
  level: string
  message: string
  interface?: string
  source_ip?: string
  source_port?: number
  destination_ip?: string
  destination_port?: number
  action?: string
}

export interface ServiceStatus {
  name: string
  status: string
  pid?: number
  cpu_percent?: number
  memory_percent?: number
}

export interface DashboardData {
  system: SystemInfo
  interfaces: NetworkInterface[]
  firewall_rules: FirewallRule[]
  recent_logs: LogEntry[]
  services: ServiceStatus[]
}

export interface IPVPNTunnel {
  id: string
  name?: string
  type: 'site-to-site' | 'client-to-site' | 'remote-access'
  mode: 'tunnel' | 'transport' | 'vti'
  local_address?: string
  local_subnet?: string[]
  remote_address?: string
  remote_subnet?: string[]
  enabled: boolean
  status: 'connected' | 'disconnected' | 'connecting' | 'error'
  authentication?: {
    mode: 'pre-shared-key' | 'rsa-signature' | 'eap-tls'
    pre_shared_key?: string
    local_id?: string
    remote_id?: string
  }
  encryption?: {
    algorithm: 'aes128' | 'aes256' | '3des'
    key_size?: number
    integrity?: 'sha1' | 'sha256' | 'sha384' | 'sha512'
  }
  lifetime?: number
  dpd?: {
    enabled: boolean
    interval?: number
    timeout?: number
  }
  nat_traversal?: boolean
  comment?: string
  statistics?: VPNTunnelStatistics
}

export interface VPNTunnelStatistics {
  uptime?: string
  bytes_in?: number
  bytes_out?: number
  packets_in?: number
  packets_out?: number
  last_connected?: string
}

export interface OpenVPNTunnel {
  id: string
  name?: string
  mode: 'server' | 'client' | 'point-to-point'
  protocol: 'udp' | 'tcp'
  port: number
  enabled: boolean
  status: 'active' | 'inactive' | 'error'
  local_address?: string
  remote_address?: string
  subnet?: string
  server_config?: {
    dev_type?: 'tun' | 'tap'
    cipher?: string
    auth?: string
    tls_version?: '1.0' | '1.1' | '1.2' | '1.3'
    keepalive?: number
    max_clients?: number
    push_routes?: string[]
  }
  client_config?: {
    dev_type?: 'tun' | 'tap'
    cipher?: string
    auth?: string
    tls_version?: '1.0' | '1.1' | '1.2' | '1.3'
    pull?: boolean
    auth_user_pass?: boolean
  }
  tls_auth?: boolean
  tls_crypt?: boolean
  compression?: 'none' | 'lz4' | 'lzo'
  comment?: string
  statistics?: OpenVPNStatistics
  client_count?: number
}

export interface OpenVPNStatistics {
  uptime?: string
  bytes_in?: number
  bytes_out?: number
  connected_clients?: number
  last_connected?: string
}

export interface WireGuardPeer {
  id: string
  name?: string
  public_key: string
  allowed_ips: string[]
  endpoint?: string
  endpoint_port?: number
  enabled: boolean
  status: 'connected' | 'disconnected' | 'waiting'
  last_handshake?: string
  latest_rx_bytes?: number
  latest_tx_bytes?: number
  persistent_keepalive?: number
  comment?: string
}

export interface WireGuardInterface {
  id: string
  name?: string
  private_key: string
  public_key?: string
  listen_port?: number
  enabled: boolean
  status: 'active' | 'inactive'
  address?: string
  peers: WireGuardPeer[]
  mtu?: number
  description?: string
  statistics?: WireGuardStatistics
}

export interface WireGuardInterfaceCreate {
  name: string
  private_key: string
  address?: string
  listen_port?: number
  mtu?: number
  description?: string
}

export interface WireGuardInterfaceUpdate {
  address?: string
  private_key?: string
  listen_port?: number
  mtu?: number
  description?: string
}

export interface WireGuardPeerAdd {
  name: string
  public_key: string
  allowed_ips?: string
  endpoint?: string
  endpoint_port?: number
  persistent_keepalive?: number
}

export interface WireGuardStatistics {
  uptime?: string
  total_rx_bytes?: number
  total_tx_bytes?: number
  peer_count?: number
}

export interface VPNTrafficStats {
  timestamp: string
  ipsec_rx_bytes: number
  ipsec_tx_bytes: number
  openvpn_rx_bytes: number
  openvpn_tx_bytes: number
  wireguard_rx_bytes: number
  wireguard_tx_bytes: number
}

export interface VPNStatistics {
  total_tunnels: number
  active_tunnels: number
  ipsec_tunnels: number
  openvpn_tunnels: number
  wireguard_tunnels: number
  total_bytes_in: number
  total_bytes_out: number
}

// BGP Types
export interface BGPConfig {
  local_as?: number
  router_id?: string
  keepalive?: number
  holdtime?: number
  neighbors: BGPNeighbor[]
  networks: string[]
}

export interface BGPNeighbor {
  ip_address: string
  remote_as: number
  description?: string
  update_source?: string
  next_hop_self: boolean
  password?: string
  advertisement_interval?: number
  ebgp_multihop?: number
  prefix_list_in?: string
  prefix_list_out?: string
  route_map_in?: string
  route_map_out?: string
}

// Prefix List Types
export interface PrefixListRule {
  sequence: number
  action: string
  prefix: string
  ge?: number
  le?: number
}

export interface PrefixList {
  name: string
  rules: PrefixListRule[]
}

// Community List Types
export interface CommunityList {
  id: string
  name: string
  type: 'standard' | 'expanded'
  rules: CommunityListRule[]
}

export interface CommunityListRule {
  sequence: number
  action: 'permit' | 'deny'
  community: string
  description?: string
}

// Route Map Types
export interface RouteMapMatch {
  ip_address_prefix_list?: string
  ipv6_address_prefix_list?: string
  community?: string
  extcommunity?: string
  large_community?: string
  as_path?: string
  local_preference?: number
  metric?: number
  tag?: number
  interface?: string
  ip_next_hop?: string
  ip_route_source?: string
  peer?: string
}

export interface RouteMapSet {
  local_preference?: number
  metric?: number
  metric_type?: 'type-1' | 'type-2'
  tag?: number
  weight?: number
  ip_next_hop?: string
  ip_nexthop_peer?: boolean
  as_path_prepend?: string[]
  as_path_exclude?: string
  as_path_replace?: string
  community?: string[]
  community_add?: string[]
  community_delete?: string[]
  extcommunity_rt?: string[]
  extcommunity_soo?: string[]
  large_community?: string[]
  large_community_add?: string[]
  large_community_delete?: string[]
  origin?: 'egp' | 'igp' | 'incomplete'
  distance?: number
  src?: string
}

export interface RouteMapRule {
  sequence: number
  action: 'permit' | 'deny'
  description?: string
  match?: RouteMapMatch
  set?: RouteMapSet
}

export interface RouteMap {
  name: string
  rules: RouteMapRule[]
}

// === IS-IS Types ===

export interface ISISInterface {
  name: string
  circuit_type?: 'level-1' | 'level-1-2' | 'level-2-only'
  hello_interval?: number
  hello_multiplier?: number
  metric?: number
  passive: boolean
  password?: string
  priority?: number
  ldp_sync_disable: boolean
}

export interface ISISRedistribute {
  source: string
  level: 'level-1' | 'level-1-2' | 'level-2'
  route_map?: string
}

export interface ISISConfig {
  net?: string
  level?: 'level-1' | 'level-1-2' | 'level-2-only'
  metric_style?: 'narrow' | 'transition' | 'wide'
  purge_originator: boolean
  set_overload_bit: boolean
  ldp_sync: boolean
  ldp_sync_holddown?: number
  spf_interval?: number
  interfaces: ISISInterface[]
  redistribute: ISISRedistribute[]
}

// === PPPoE Types ===

export interface PPPoEInterface {
  name: string
  source_interface: string
  username: string
  description?: string
  mtu?: number
  default_route: boolean
  name_servers: boolean
}

export interface PPPoEInterfaceCreate {
  name: string
  source_interface: string
  username: string
  password: string
  description?: string
  mtu?: number
  default_route?: boolean
  name_servers?: boolean
}

export interface PPPoEInterfaceUpdate {
  source_interface?: string
  username?: string
  password?: string
  description?: string
  mtu?: number
  default_route?: boolean
  name_servers?: boolean
}

export interface PPPoEInterfaceStatus {
  name: string
  status: 'up' | 'down' | 'unknown' | 'error'
  ip_address?: string
  remote_ip?: string
  uptime?: string
  raw_output?: string
  error?: string
}

export interface PPPoEStatus {
  interfaces: PPPoEInterfaceStatus[]
  error?: string
}

export interface PPPoEConfig {
  interfaces: PPPoEInterface[]
}

// === IPsec Types ===
export interface IPsecPeer {
  name: string
  remote_address?: string
  local_address?: string
  description?: string
  ike_group?: number
  esp_group?: number
  tunnels: IPsecTunnel[]
}

export interface IPsecTunnel {
  name: string
  local_prefix?: string
  remote_prefix?: string
}

export interface IPsecPeerCreate {
  name: string
  remote_address: string
  local_address?: string
  pre_shared_key?: string
  description?: string
  ike_group?: number
  esp_group?: number
}

export interface IPsecTunnelAdd {
  tunnel_name: string
  local_prefix: string
  remote_prefix: string
}

export interface IPsecConfig {
  peers: IPsecPeer[]
}

// === OpenVPN Types ===
export interface OpenVPNInstance {
  name: string
  mode?: string
  protocol?: string
  port?: number
  device?: string
  description?: string
}

export interface OpenVPNCreate {
  name: string
  mode?: string
  protocol?: string
  port?: number
  device?: string
  description?: string
}

export interface OpenVPNConfig {
  instances: OpenVPNInstance[]
}
