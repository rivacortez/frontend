import { z } from 'zod'
import { backendFetch } from '../../utils/backend'
import type { OverheadCostView } from './index.get'

interface Envelope<T> { success: boolean, data: T }

const periodSchema = z.string().regex(/^\d{4}-\d{2}$/, 'El período debe tener formato YYYY-MM')

// HU-06-02 · Alta de un CIF mensual (concepto + monto). El backend exige
// owner/manager (CASL manage Report); el tenant sale del JWT (no del body).
const createOverheadCostSchema = z.object({
  period: periodSchema,
  concept: z.string().min(1),
  amount: z.number().positive(),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, createOverheadCostSchema.parse)
  const res = await backendFetch<Envelope<OverheadCostView>>(event, '/api/overhead-costs', {
    method: 'POST',
    body,
  })
  return ok(res.data)
})
