import { backendFetch } from '../../utils/backend'

interface Envelope<T> { success: boolean, data: T }

/**
 * Proxy autenticado → backend `POST /api/notifications/read-all` (E10,
 * HU-10-01). Marca TODAS las no leídas del usuario (suyas + broadcast).
 * Devuelve `{ updated }` (cuántas se marcaron).
 */
export default defineEventHandler(async (event) => {
  const res = await backendFetch<Envelope<{ updated: number }>>(
    event,
    '/api/notifications/read-all',
    { method: 'POST' },
  )
  return ok(res.data)
})
