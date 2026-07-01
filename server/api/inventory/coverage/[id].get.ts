import { ingredientCoverage } from '../../../utils/inventory-adapter'

// Proxy autenticado → backend GET /api/inventory/ingredients/:id/coverage.
// Cobertura real de stock en días, basada en consumo promedio de los últimos 30 días.
// `daysLeft:null` cuando avgDailyConsumption === 0 (sin movimientos recientes).
// Reemplaza la heurística local status→días con datos reales del backend (Widget B).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const data = await ingredientCoverage(event, id)
  return ok(data)
})
