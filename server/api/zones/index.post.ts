import { z } from 'zod'
import { backendFetch } from '../../utils/backend'
import type { ZoneView } from './index.get'

interface Envelope<T> { success: boolean, data: T }

const createZoneSchema = z.object({
  name: z.string().min(1).max(60),
  position: z.number().int().min(0).optional(),
})

// Crea una zona del salón (HU-03-01). El backend exige owner/manager (CASL create Zone).
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, createZoneSchema.parse)
  const res = await backendFetch<Envelope<ZoneView>>(event, '/api/zones', {
    method: 'POST',
    body,
  })
  return ok(res.data)
})
