import type { ApiResponse } from '#shared/types/api'
import type { AppNotification } from '#shared/types/domain'

/**
 * E10 · Notificaciones in-app (HU-10-01) + preferencias (HU-10-03). El backend
 * NestJS las gobierna; el BFF (`server/api/notifications/**`) proxea con
 * `backendFetch` y mapea `NotificationView` → `AppNotification`
 * (`notifications-adapter`). Bandeja PERSONAL: cualquier usuario auth ve sus
 * dirigidas + las broadcast del tenant (sin gate de rol).
 *
 * Polling (no hay SSE en el backend aún, igual que el KDS): `staleTime` bajo +
 * `refetchOnWindowFocus`/`refetchOnReconnect` para que la campana/bandeja se
 * sientan casi en tiempo real. TODO: migrar a SSE cuando el backend lo exponga.
 */
const NOTIFICATIONS_POLL_STALE_MS = 30_000

/** Tipos de notificación del backend (`notificationTypeSchema`). */
export type NotificationType = 'low_stock' | 'order_ready' | 'bill_requested' | 'system'

/** HU-10-03 · Preferencia por tipo y canal (in-app / email). */
export interface NotificationPreference {
  type: NotificationType
  inApp: boolean
  email: boolean
}

interface UseNotificationsOpts {
  /** Solo las no leídas (la bandeja las trae todas por defecto). */
  unreadOnly?: MaybeRefOrGetter<boolean | undefined>
  limit?: MaybeRefOrGetter<number | undefined>
}

/** HU-10-01 · Bandeja del usuario (mapeada a `AppNotification[]`). */
export function useNotifications(opts: UseNotificationsOpts = {}) {
  return useQuery({
    key: () => ['notifications', 'list', toValue(opts.unreadOnly) ?? false, toValue(opts.limit) ?? 0] as const,
    query: () =>
      $fetch<ApiResponse<AppNotification[]>>('/api/notifications', {
        query: {
          unreadOnly: toValue(opts.unreadOnly) || undefined,
          limit: toValue(opts.limit) || undefined,
        },
      }).then(r => r.data),
    staleTime: NOTIFICATIONS_POLL_STALE_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

/**
 * HU-10-01 · Contador AUTORITATIVO de no leídas para el badge de la campana. El
 * backend lo calcula contando TODAS las no leídas del usuario (ignora
 * `unreadOnly`/`limit`) y lo expone en `meta.unreadCount`; pedimos `limit=1` para
 * que la consulta del badge sea barata. `data` es el número (0 si no hay meta).
 */
export function useUnreadCount() {
  return useQuery({
    key: ['notifications', 'unread-count'],
    query: () =>
      $fetch<ApiResponse<AppNotification[]>>('/api/notifications', {
        query: { limit: 1 },
      }).then(r => r.meta?.unreadCount ?? 0),
    staleTime: NOTIFICATIONS_POLL_STALE_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

/** Invalida bandeja + badge (toda mutación de lectura los refresca). */
function useInvalidateNotifications() {
  const cache = useQueryCache()
  return () => cache.invalidateQueries({ key: ['notifications'] })
}

/** HU-10-01 · Marca UNA notificación como leída. */
export function useMarkRead() {
  const invalidate = useInvalidateNotifications()
  return useMutation({
    mutation: (id: string) =>
      $fetch<ApiResponse<AppNotification>>('/api/notifications/read', {
        method: 'POST',
        body: { id },
      }).then(r => r.data),
    onSettled: invalidate,
  })
}

/** HU-10-01 · Marca TODAS las no leídas del usuario como leídas. */
export function useMarkAllRead() {
  const invalidate = useInvalidateNotifications()
  return useMutation({
    mutation: () =>
      $fetch<ApiResponse<{ updated: number }>>('/api/notifications/read-all', {
        method: 'POST',
      }).then(r => r.data),
    onSettled: invalidate,
  })
}

/** HU-10-03 · Preferencias persistidas del usuario (los tipos sin fila usan default). */
export function useNotificationPreferences() {
  return useQuery({
    key: ['notifications', 'preferences'],
    query: () =>
      $fetch<ApiResponse<NotificationPreference[]>>('/api/notifications/preferences').then(r => r.data),
    staleTime: 5 * 60_000,
  })
}

/** HU-10-03 · Configura una preferencia (tipo × canal); upsert en el backend. */
export function useSetPreference() {
  const cache = useQueryCache()
  return useMutation({
    mutation: (body: { type: NotificationType, inApp?: boolean, email?: boolean }) =>
      $fetch<ApiResponse<NotificationPreference>>('/api/notifications/preferences', {
        method: 'PATCH',
        body,
      }).then(r => r.data),
    onSettled: () => cache.invalidateQueries({ key: ['notifications', 'preferences'] }),
  })
}
