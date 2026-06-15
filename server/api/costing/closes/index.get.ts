import { backendFetch } from '../../../utils/backend'
import type { PeriodCostingView } from '../dishes.get'

interface Envelope<T> { success: boolean, data: T }

// E06 · HU-06-06 · Cierre de período mensual: cifras finales + snapshot inmutable del
// reporte de platos. Toda la moneda llega como string (PEN).
export interface CostingCloseView {
  id: string
  period: string
  totalCIF: string
  totalUnits: number
  totalIngredientCost: string
  totalRevenue: string
  totalContribution: string
  closedAt: string
  userId: string | null
  snapshot: PeriodCostingView
}

// Proxy autenticado → backend GET /api/costing/closes (cierres del tenant, más
// reciente primero). Lectura = owner/manager (read Report); staff → 403.
export default defineEventHandler(async (event) => {
  const res = await backendFetch<Envelope<CostingCloseView[]>>(event, '/api/costing/closes')
  return ok(res.data, { totalCount: res.data.length, page: 1 })
})
