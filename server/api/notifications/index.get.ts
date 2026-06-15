import { backendFetch } from '../../utils/backend'
import {
  toFrontendNotification,
  type BeNotificationListView,
} from '../../utils/notifications-adapter'

interface Envelope<T> { success: boolean, data: T }

/**
 * Proxy autenticado → backend `GET /api/notifications` (E10, HU-10-01). Bandeja
 * PERSONAL del usuario (sus dirigidas + las broadcast del tenant); el backend
 * aplica `JwtAuthGuard` y el alcance por `claims.sub` (cualquier usuario auth ve
 * las suyas, sin gate de rol). Reenvía `unreadOnly`/`limit` y mapea el
 * `NotificationView` del backend → `AppNotification` del frontend. El
 * `unreadCount` (cuenta TODAS las no leídas, ignora los filtros) viaja en
 * `meta.unreadCount` → es el badge de la campana.
 */
export default defineEventHandler(async (event) => {
  const { unreadOnly, limit } = getQuery(event)
  const query: Record<string, unknown> = {}
  if (unreadOnly !== undefined) query.unreadOnly = unreadOnly
  if (limit !== undefined) query.limit = limit

  const res = await backendFetch<Envelope<BeNotificationListView>>(event, '/api/notifications', { query })
  const items = res.data.items.map(toFrontendNotification)
  return ok(items, { totalCount: items.length, page: 1, unreadCount: res.data.unreadCount })
})
