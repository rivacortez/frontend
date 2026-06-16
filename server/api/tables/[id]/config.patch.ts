import { z } from 'zod'
import { backendFetch } from '../../../utils/backend'
import type { TableConfigView } from '../config.get'

interface Envelope<T> { success: boolean, data: T }

// Editar una mesa desde la CONFIG del salón (renombrar `code`, cambiar capacidad,
// mover de zona). Va DIRECTO al backend (PATCH /api/tables/:id) devolviendo el
// `TableView` crudo — separado del `PATCH /api/tables/:id` del POS (que solo
// toca `status` vía pos-adapter y devuelve el `DiningTable` mapeado). Así no se
// rompe el contrato del mapa POS. El backend exige owner/manager (update Table);
// 409 ante `code` duplicado (mensaje propagado → toast).
const patchTableConfigSchema = z.object({
  zoneId: z.string().uuid().optional(),
  code: z.string().min(1).max(32).optional(),
  capacity: z.number().int().positive().optional(),
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Falta el id' })
  const body = await readValidatedBody(event, patchTableConfigSchema.parse)
  const res = await backendFetch<Envelope<TableConfigView>>(event, `/api/tables/${id}`, {
    method: 'PATCH',
    body,
  })
  return ok(res.data)
})
