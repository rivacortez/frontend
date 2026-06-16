import { z } from 'zod'
import { backendFetch } from '../../utils/backend'
import type { ZoneView } from './index.get'

interface Envelope<T> { success: boolean, data: T }

const patchZoneSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  position: z.number().int().min(0).optional(),
})

// Renombra / reordena una zona (HU-03-01). El backend exige owner/manager.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Falta el id' })
  const body = await readValidatedBody(event, patchZoneSchema.parse)
  const res = await backendFetch<Envelope<ZoneView>>(event, `/api/zones/${id}`, {
    method: 'PATCH',
    body,
  })
  return ok(res.data)
})
