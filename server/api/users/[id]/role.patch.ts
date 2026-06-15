import { backendFetch } from '../../../utils/backend'

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

// Proxy autenticado: asignar roles (backend PATCH /api/users/:id/role → solo owner).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody<{ roles: string[] }>(event)
  return backendFetch<ApiEnvelope<UserView>>(event, `/api/users/${id}/role`, {
    method: 'PATCH',
    body,
  })
})
