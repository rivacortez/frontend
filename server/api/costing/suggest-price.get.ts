import { backendFetch } from '../../utils/backend'

interface Envelope<T> { success: boolean, data: T }

// E06 · HU-06-05 · Precio sugerido para un margen objetivo (fórmula determinista).
export interface SuggestPriceView {
  menuItemId: string
  period: string
  fullCost: string
  targetMarginPct: string
  suggestedPrice: string
}

// Proxy autenticado → backend GET /api/costing/suggest-price?menuItemId=&targetMarginPct=&period=.
// `targetMarginPct` ∈ [0, 99] (lo valida el backend). Lectura = owner/manager (read Report).
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const menuItemId = q.menuItemId as string | undefined
  const targetMarginPct = q.targetMarginPct as string | undefined
  const period = q.period as string | undefined
  if (!menuItemId || targetMarginPct === undefined || !period) {
    throw createError({ statusCode: 400, statusMessage: 'Faltan parámetros (menuItemId, targetMarginPct, period)' })
  }
  const res = await backendFetch<Envelope<SuggestPriceView>>(event, '/api/costing/suggest-price', {
    query: { menuItemId, targetMarginPct, period },
  })
  return ok(res.data)
})
