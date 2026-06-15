/** Sobre de respuesta compartido con la API (frontend_context.md §6). */
export interface ApiResponse<T> {
  success: boolean
  data: T
  error?: { code: string, message: string }
  /** `unreadCount` solo lo trae la bandeja de notificaciones (E10) — es el badge de la campana. */
  meta?: { totalCount: number, page: number, unreadCount?: number }
}

export type AppRole = 'owner' | 'manager' | 'staff'
