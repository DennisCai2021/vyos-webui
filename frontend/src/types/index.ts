/** Common type definitions */

export interface User {
  username: string
  email?: string
  full_name?: string
  roles: string[]
  permissions: string[]
  mfa_enabled: boolean
  mfa_method?: string
  last_login?: string
}

export interface CreateUserRequest {
  username: string
  email?: string
  full_name?: string
  password: string
  is_active?: boolean
  role_ids?: number[]
  roles?: string[]
}

export interface UpdateUserRequest {
  email?: string
  full_name?: string
  password?: string
  is_active?: boolean
  role_ids?: number[]
  roles?: string[]
}

export interface Role {
  id: number
  name: string
  description?: string
  permissions: Permission[]
  created_at: string
  updated_at: string
}

export interface CreateRoleRequest {
  name: string
  description?: string
  permission_ids?: number[]
}

export interface UpdateRoleRequest {
  name?: string
  description?: string
  permission_ids?: number[]
}

export interface Permission {
  id: number
  name: string
  code: string
  description?: string
  resource: string
  action: string
}

export interface Session {
  id: number
  user_id: number
  username: string
  ip_address?: string
  user_agent?: string
  created_at: string
  last_accessed_at: string
  is_current: boolean
}

export interface PasswordPolicy {
  min_length: number
  require_uppercase: boolean
  require_lowercase: boolean
  require_numbers: boolean
  require_special_chars: boolean
  max_age_days?: number
  history_count?: number
}

export interface LoginRequest {
  username: string
  password: string
  mfa_code?: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  expires_in: number
  mfa_required: boolean
  mfa_method?: string
}

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginationParams {
  page: number
  page_size: number
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface NetworkInterface {
  name: string
  description?: string
  ip_address?: string
  mac_address?: string
  status: 'up' | 'down'
  speed?: string
  duplex?: string
}

export interface Route {
  destination: string
  gateway?: string
  interface?: string
  metric?: number
  route_type?: 'connected' | 'static' | 'dynamic'
}

export interface FirewallRule {
  id: number
  sequence: number
  action: 'accept' | 'drop' | 'reject'
  source: string
  destination: string
  service?: string
  description?: string
  enabled: boolean
}

export interface VPNTunnel {
  id: number
  name: string
  type: 'ipsec' | 'openvpn' | 'wireguard'
  local_address: string
  remote_address: string
  status: 'up' | 'down' | 'connecting'
}
