import { z } from 'zod'
import { backendFetch } from '../../utils/backend'
import type { TableConfigView } from './config.get'

interface Envelope<T> { success: boolean, data: T }

// Crear mesa = configurar el salón → owner/manager (CASL create Table). El `code`
// es único por tenant (el backend devuelve 409 ante duplicado). El POS sigue
// usando GET/open/PATCH; este POST es solo para la pantalla de config.
const createTableSchema = z.object({
  zoneId: z.string().uuid(),
  code: z.string().min(1).max(32),
  capacity: z.number().int().positive().optional(),
  posX: z.number().int().optional(),
  posY: z.number().int().optional(),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, createTableSchema.parse)
  const res = await backendFetch<Envelope<TableConfigView>>(event, '/api/tables', {
    method: 'POST',
    body,
  })
  return ok(res.data)
})
