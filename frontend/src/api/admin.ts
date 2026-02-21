/** Admin API for user, role, and permission management */

import apiClient from './client'
import type {
  User,
  Role,
  Session,
  CreateUserRequest,
  UpdateUserRequest,
  PaginatedResponse,
  Permission,
} from '../types'

// Backend user response type
interface BackendUser {
  username: string
  full_name?: string
  email?: string
  roles: string[]
  enabled: boolean
  mfa_enabled: boolean
  mfa_method?: string
  created_at: string
  last_login?: string
  failed_login_attempts: number
  locked_until?: string
}

// Backend role response type
interface BackendRole {
  name: string
  description?: string
  permissions: string[]
  is_system: boolean
}

// Transform backend user to frontend format
function transformUser(backend: BackendUser, index: number): User & { id: number; username: string } {
  return {
    id: index + 1,
    username: backend.username,
    full_name: backend.full_name,
    email: backend.email,
    roles: backend.roles,
    permissions: [],
    mfa_enabled: backend.mfa_enabled,
    mfa_method: backend.mfa_method,
    last_login: backend.last_login,
  }
}

// Transform backend role to frontend format
function transformRole(backend: BackendRole, index: number): Role {
  return {
    id: index + 1,
    name: backend.name,
    description: backend.description,
    permissions: backend.permissions.map((p, idx) => ({
      id: idx + 1,
      name: p,
      code: p,
      resource: p.split(':')[0] || '',
      action: p.split(':')[1] || '',
    })),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

/**
 * Admin API client
 */
export const adminApi = {
  // User management
  async getUsers(page = 1, pageSize = 20): Promise<PaginatedResponse<User & { id: number; username: string }>> {
    const data = await apiClient.get<BackendUser[]>('/users')
    const items = data.map(transformUser)
    const start = (page - 1) * pageSize
    const end = start + pageSize
    return {
      items: items.slice(start, end),
      total: items.length,
      page,
      page_size: pageSize,
      total_pages: Math.ceil(items.length / pageSize),
    }
  },

  async getRoles(): Promise<Role[]> {
    try {
      const data = await apiClient.get<BackendRole[]>('/users/roles')
      return data.map(transformRole)
    } catch (error) {
      // Return default roles if API fails
      return [
        {
          id: 1,
          name: 'admin',
          description: 'Administrator with full access',
          permissions: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 2,
          name: 'user',
          description: 'Regular user with limited access',
          permissions: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]
    }
  },

  async getPermissions(): Promise<Permission[]> {
    // Stub - return empty array
    return []
  },

  async createUser(data: CreateUserRequest & { roles?: string[] }): Promise<any> {
    return apiClient.post('/users', {
      username: data.username,
      full_name: data.full_name,
      email: data.email,
      password: data.password,
      roles: data.roles || ['user'],
    })
  },

  async updateUser(username: string, data: UpdateUserRequest & { roles?: string[]; enabled?: boolean }): Promise<any> {
    return apiClient.put(`/users/${username}`, data)
  },

  async deleteUser(username: string): Promise<void> {
    return apiClient.delete(`/users/${username}`)
  },

  async toggleUserActive(username: string, isActive: boolean): Promise<any> {
    if (isActive) {
      return apiClient.post(`/users/${username}/enable`)
    } else {
      return apiClient.post(`/users/${username}/disable`)
    }
  },

  async resetUserPassword(username: string, newPassword: string): Promise<void> {
    // Password reset is handled via update user
    return apiClient.put(`/users/${username}`, { password: newPassword })
  },

  async createRole(_data: any): Promise<any> {
    // Stub
    return Promise.resolve({})
  },

  async updateRole(_id: number, _data: any): Promise<any> {
    // Stub
    return Promise.resolve({})
  },

  async deleteRole(_id: number): Promise<void> {
    // Stub
    return Promise.resolve()
  },

  async getPasswordPolicy(): Promise<any> {
    // Stub - return default policy
    return {
      min_length: 8,
      require_uppercase: true,
      require_lowercase: true,
      require_numbers: true,
      require_special_chars: false,
    }
  },

  async updatePasswordPolicy(_data: any): Promise<any> {
    // Stub
    return Promise.resolve({})
  },

  // Session management
  async getSessions(username?: string): Promise<Session[]> {
    try {
      const url = username ? `/users/${username}/sessions` : '/users/sessions'
      return apiClient.get<Session[]>(url)
    } catch (error) {
      return []
    }
  },

  async terminateSession(sessionId: number | string): Promise<void> {
    return apiClient.delete(`/users/sessions/${sessionId}`)
  },

  async terminateAllSessions(): Promise<void> {
    // Stub
    return Promise.resolve()
  },
}
