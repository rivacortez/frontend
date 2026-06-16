import { backendFetch } from '../../utils/backend'

interface Envelope<T> { success: boolean, data: T }
export interface ZoneView {
  id: string
  name: string
  position: number
}

// Proxy autenticado → backend E03 GET /api/zones (HU-03-01). El backend devuelve
// un shape ya frontend-friendly; el BFF solo reenvía con el Bearer de la sesión
// (RBAC del backend: read Zone = owner/manager/staff).
export default defineEventHandler(async (event) => {
  const res = await backendFetch<Envelope<ZoneView[]>>(event, '/api/zones')
  return ok(res.data, { totalCount: res.data.length, page: 1 })
})
