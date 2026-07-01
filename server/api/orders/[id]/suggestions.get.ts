import { orderSuggestions } from '../../../utils/pos-adapter'

// Proxy autenticado → backend GET /api/orders/:id/suggestions?limit=3.
// Top 3 platos más vendidos no presentes en la orden actual. Recomendación comercial
// basada en historial de ventas — NOT ML/IA. El BFF resuelve menuItemId → recipeId
// para que el carrito del POS pueda agregar el ítem directamente (Widget D).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const data = await orderSuggestions(event, id)
  return ok(data)
})
