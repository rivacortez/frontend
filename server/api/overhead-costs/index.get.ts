import { backendFetch } from '../../utils/backend'

interface Envelope<T> { success: boolean, data: T }

// E06 · HU-06-02 · Costo indirecto (CIF) mensual. El backend devuelve la moneda
// como string (PEN, precisión Decimal); el cliente la formatea.
export interface OverheadCostView {
  id: string
  period: string
  concept: string
  amount: string
}

// Proxy autenticado → backend GET /api/overhead-costs?period=YYYY-MM (CIF del mes).
// `?period=` es opcional (sin él lista todos). Lectura = owner/manager (read Report);
// el backend devuelve 403 a staff. El BFF solo reenvía con el Bearer de la sesión.
export default defineEventHandler(async (event) => {
  const period = getQuery(event).period as string | undefined
  const res = await backendFetch<Envelope<OverheadCostView[]>>(event, '/api/overhead-costs', {
    query: period ? { period } : undefined,
  })
  return ok(res.data, { totalCount: res.data.length, page: 1 })
})
