import { backendFetch } from '../../utils/backend'

interface Envelope<T> { success: boolean, data: T }

// E06 · HU-06-07 · Comparativo costo real (salidas de inventario) vs teórico (BOM por
// venta). `note` documenta verbatim la limitación (pagar una orden no descuenta stock
// aún) → debe surfacearse en la UI sin reescribirla.
export interface CostVarianceView {
  period: string
  theoreticalCost: string
  realCost: string
  variance: string
  variancePct: string
  byType: { waste: string, sale: string }
  note: string
}

// Proxy autenticado → backend GET /api/costing/cost-variance?period=YYYY-MM
// (período obligatorio). Lectura = owner/manager (read Report); staff → 403.
export default defineEventHandler(async (event) => {
  const period = getQuery(event).period as string | undefined
  if (!period) throw createError({ statusCode: 400, statusMessage: 'Falta el período (YYYY-MM)' })
  const res = await backendFetch<Envelope<CostVarianceView>>(event, '/api/costing/cost-variance', {
    query: { period },
  })
  return ok(res.data)
})
