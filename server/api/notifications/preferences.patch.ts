import { z } from 'zod'
import { backendFetch } from '../../utils/backend'
import type { BePreferenceView } from '../../utils/notifications-adapter'

interface Envelope<T> { success: boolean, data: T }

// Espeja `setPreferenceSchema` del backend (Zod, strict): tipo + al menos un canal.
const setPreferenceSchema = z.object({
  type: z.enum(['low_stock', 'order_ready', 'bill_requested', 'system']),
  inApp: z.boolean().optional(),
  email: z.boolean().optional(),
})

/**
 * Proxy autenticado → backend `PATCH /api/notifications/preferences` (E10,
 * HU-10-03). Upsert de la preferencia (usuario, tipo): canales `inApp`/`email`
 * opcionales (se conserva el valor previo / default si no se envían). `email`
 * es el canal reservado para HU-10-02 (Resend, diferido). Devuelve la
 * preferencia resultante.
 */
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, setPreferenceSchema.parse)
  const res = await backendFetch<Envelope<BePreferenceView>>(event, '/api/notifications/preferences', {
    method: 'PATCH',
    body,
  })
  return ok(res.data)
})
