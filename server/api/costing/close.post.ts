import { z } from 'zod'
import { backendFetch } from '../../utils/backend'
import type { CostingCloseView } from './closes/index.get'

interface Envelope<T> { success: boolean, data: T }

// HU-06-06 · Cierre de período mensual: fija las cifras finales y guarda el snapshot
// del reporte (un cierre por mes; recerrar → 409). Escritura = owner/manager (manage Report).
const closePeriodSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'El período debe tener formato YYYY-MM'),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, closePeriodSchema.parse)
  const res = await backendFetch<Envelope<CostingCloseView>>(event, '/api/costing/close', {
    method: 'POST',
    body,
  })
  return ok(res.data)
})
