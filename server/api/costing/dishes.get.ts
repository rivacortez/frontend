import { backendFetch } from '../../utils/backend'

interface Envelope<T> { success: boolean, data: T }

// E06 · HU-06-01/03/04 · Costeo de un plato del menú en un período. Toda la moneda
// llega como string (PEN, precisión Decimal); el cliente la formatea.
export interface DishCostView {
  menuItemId: string
  name: string
  sellPrice: string
  ingredientCost: string
  unitsSold: number
  cifPerUnit: string
  fullCost: string
  foodCostPct: string
  marginPct: string
  contributionMargin: string
}

// HU-06-03 · Reporte de costeo de un período: prorrateo del CIF + detalle por plato.
export interface PeriodCostingView {
  period: string
  totalCIF: string
  totalUnits: number
  cifPerUnit: string
  allocationBase: 'units'
  dishes: DishCostView[]
}

// Proxy autenticado → backend GET /api/costing/dishes?period=YYYY-MM (período
// obligatorio). Lectura = owner/manager (read Report); staff → 403. Thin passthrough.
export default defineEventHandler(async (event) => {
  const period = getQuery(event).period as string | undefined
  if (!period) throw createError({ statusCode: 400, statusMessage: 'Falta el período (YYYY-MM)' })
  const res = await backendFetch<Envelope<PeriodCostingView>>(event, '/api/costing/dishes', {
    query: { period },
  })
  return ok(res.data)
})
