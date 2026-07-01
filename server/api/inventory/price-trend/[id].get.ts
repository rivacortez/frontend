import { ingredientPriceTrend } from '../../../utils/inventory-adapter'

// Proxy autenticado → backend GET /api/inventory/ingredients/:id/price-trend?limit=12.
// Historial de precios de compra del insumo (purchase_order | manual), más reciente
// primero. Fuente: órdenes de compra recibidas y ajustes manuales de precio.
// Etiquetado honesto como "Tendencia de precio de compra" — NOT IA (Widget C).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const data = await ingredientPriceTrend(event, id)
  return ok(data)
})
