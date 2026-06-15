import type { AppNotification, NotificationKind } from '#shared/types/domain'

/**
 * Adaptador E10 (anti-corruption layer del BFF). El backend NestJS gobierna las
 * notificaciones in-app (HU-10-01) y las preferencias por tipo×canal (HU-10-03).
 * Aquí se traduce backend ⇄ frontend para que la pantalla/badge Vue no cambien su
 * contrato (`shared/types/domain.ts`): el backend usa `type`/`readAt`/`createdAt`,
 * el frontend `kind`/`read`/`date`.
 */

// ---- Formas del backend (notifications.service.ts) ----

/** Tipos del dominio (notification.ts del backend, `notificationTypeSchema`). */
export type BeNotificationType = 'low_stock' | 'order_ready' | 'bill_requested' | 'system'

export interface BeNotificationView {
  id: string
  type: string
  title: string
  body: string
  data: unknown
  readAt: string | null
  createdAt: string
}

export interface BeNotificationListView {
  items: BeNotificationView[]
  unreadCount: number
}

export interface BePreferenceView {
  type: string
  inApp: boolean
  email: boolean
}

export interface BePreferenceListView {
  items: BePreferenceView[]
}

// ---- Mapeos backend → frontend ----

/**
 * Tipo del backend → `kind` de severidad que usa la UI (icono/color). `low_stock`
 * y `bill_requested` son accionables/urgentes (warning); `order_ready` es positivo
 * (success); `system` (genérico / alertas IA futuras) es informativo.
 */
const KIND_BY_TYPE: Record<BeNotificationType, NotificationKind> = {
  low_stock: 'warning',
  bill_requested: 'warning',
  order_ready: 'success',
  system: 'info',
}

function toKind(type: string): NotificationKind {
  return KIND_BY_TYPE[type as BeNotificationType] ?? 'info'
}

/** Extrae un id de string del `data` (JSON libre) por cualquiera de varias claves. */
function pickId(data: unknown, keys: string[]): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const record = data as Record<string, unknown>
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

/**
 * Deep-link best-effort según el tipo + `data` del backend (que no modela acción).
 * Si no hay un destino claro se omite (la fila no muestra CTA). Mantiene el
 * contrato `actionLabel`/`actionTo` que ya consumía la pantalla.
 */
function toAction(type: string, data: unknown): { actionLabel?: string, actionTo?: string } {
  switch (type as BeNotificationType) {
    case 'low_stock': {
      const ingredientId = pickId(data, ['ingredientId', 'productId'])
      return ingredientId
        ? { actionLabel: 'Ver insumo', actionTo: `/app/stock/product/${ingredientId}` }
        : { actionLabel: 'Lista de compra', actionTo: '/app/stock/shopping-list' }
    }
    case 'order_ready': {
      return { actionLabel: 'Ver cocina', actionTo: '/app/cocina' }
    }
    case 'bill_requested': {
      const tableId = pickId(data, ['tableId'])
      return tableId
        ? { actionLabel: 'Ver mesa', actionTo: `/app/pos/mesa/${tableId}` }
        : { actionLabel: 'Ver salón', actionTo: '/app/pos' }
    }
    default:
      return {}
  }
}

/** Backend `NotificationView` → `AppNotification` del frontend. */
export function toFrontendNotification(n: BeNotificationView): AppNotification {
  return {
    id: n.id,
    kind: toKind(n.type),
    title: n.title,
    body: n.body,
    date: n.createdAt,
    read: n.readAt !== null,
    ...toAction(n.type, n.data),
  }
}
