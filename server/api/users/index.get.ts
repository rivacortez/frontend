import { backendFetch } from '../../utils/backend'

interface ApiEnvelope<T> {
  success: boolean
  data: T
}

interface UserView {
  id: string
  email: string
  name: string
  roles: string[]
}

// Proxy autenticado: lista los usuarios del tenant (backend GET /api/users).
// El backend aplica JwtAuthGuard + RBAC (owner/manager ✓, staff → 403).
export default defineEventHandler((event) => {
  return backendFetch<ApiEnvelope<UserView[]>>(event, '/api/users')
})
