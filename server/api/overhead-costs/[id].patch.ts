import { z } from 'zod'
import { backendFetch } from '../../utils/backend'
import type { OverheadCostView } from './index.get'

interface Envelope<T> { success: boolean, data: T }

const periodSchema = z.string().regex(/^\d{4}-\d{2}$/, 'El período debe tener formato YYYY-MM')

// HU-06-02 · Edición parcial de un CIF (puede reasignarse a otro período). Al menos
// un campo presente. Escritura = owner/manager (CASL manage Report).
const patchOverheadCostSchema = z
  .object({
    period: periodSchema.optional(),
    concept: z.string().min(1).optional(),
    amount: z.number().positive().optional(),
  })
  .refine(v => Object.keys(v).length > 0, { message: 'Debe enviar al menos un campo a actualizar' })

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Falta el id' })
  const body = await readValidatedBody(event, patchOverheadCostSchema.parse)
  const res = await backendFetch<Envelope<OverheadCostView>>(event, `/api/overhead-costs/${id}`, {
    method: 'PATCH',
    body,
  })
  return ok(res.data)
})
