import { backendFetch } from '../../utils/backend'
import type { BePreferenceListView } from '../../utils/notifications-adapter'

interface Envelope<T> { success: boolean, data: T }

/**
 * Proxy autenticado → backend `GET /api/notifications/preferences` (E10,
 * HU-10-03). Devuelve solo las preferencias PERSISTIDAS del usuario
 * (`{ type, inApp, email }[]`); los tipos sin fila usan el default
 * (inApp=true, email=false), que el frontend aplica. Shape ya frontend-friendly
 * → passthrough sin mapeo.
 */
export default defineEventHandler(async (event) => {
  const res = await backendFetch<Envelope<BePreferenceListView>>(event, '/api/notifications/preferences')
  return ok(res.data.items)
})
