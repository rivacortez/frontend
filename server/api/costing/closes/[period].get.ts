import { backendFetch } from '../../../utils/backend'
import type { CostingCloseView } from './index.get'

interface Envelope<T> { success: boolean, data: T }

// Proxy autenticado → backend GET /api/costing/closes/:period (cierre de un período;
// 404 si no existe). Lectura = owner/manager (read Report); staff → 403.
export default defineEventHandler(async (event) => {
  const period = getRouterParam(event, 'period')
  if (!period) throw createError({ statusCode: 400, statusMessage: 'Falta el período' })
  const res = await backendFetch<Envelope<CostingCloseView>>(event, `/api/costing/closes/${period}`)
  return ok(res.data)
})
