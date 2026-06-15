import { z } from 'zod'
import { backendFetch } from '../../utils/backend'
import {
  toFrontendNotification,
  type BeNotificationView,
} from '../../utils/notifications-adapter'

interface Envelope<T> { success: boolean, data: T }

const readSchema = z.object({ id: z.string().min(1) })

/**
 * Proxy autenticado → backend `POST /api/notifications/:id/read` (E10,
 * HU-10-01). Marca UNA notificación como leída (debe pertenecer al usuario o ser
 * broadcast; idempotente). Devuelve la notificación mapeada al shape del
 * frontend. Marcar TODAS vive en `read-all.post.ts`.
 */
export default defineEventHandler(async (event) => {
  const { id } = await readValidatedBody(event, readSchema.parse)
  const res = await backendFetch<Envelope<BeNotificationView>>(
    event,
    `/api/notifications/${encodeURIComponent(id)}/read`,
    { method: 'POST' },
  )
  return ok(toFrontendNotification(res.data))
})
