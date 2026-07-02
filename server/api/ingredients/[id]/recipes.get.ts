import { backendFetch } from '../../../utils/backend'

interface Envelope<T> { success: boolean, data: T }

// Forma cruda del backend: qty/costos como string Decimal.
interface BeRecipeUsage {
  recipeId: string
  name: string
  kind: string
  emoji: string | null
  qty: string
  wasteFactor: string
  lineCost: string
  recipeTotalCost: string
}

// E02 · Recetas que usan un insumo (panel "Usado en" del detalle). El backend
// resuelve el BOM real (el listado general de recetas trae items:[] a propósito).
// Se convierte la moneda/cantidad string → number para que la vista solo formatee.
export interface RecipeUsageView {
  recipeId: string
  name: string
  kind: string
  emoji: string | null
  qty: number
  wasteFactor: number
  lineCost: number
  recipeTotalCost: number
}

const num = (s: string | null | undefined): number => (s == null ? 0 : Number(s))

// Proxy autenticado → backend GET /api/ingredients/:id/recipes.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const res = await backendFetch<Envelope<BeRecipeUsage[]>>(event, `/api/ingredients/${id}/recipes`)
  const usages: RecipeUsageView[] = res.data.map(u => ({
    recipeId: u.recipeId,
    name: u.name,
    kind: u.kind,
    emoji: u.emoji,
    qty: num(u.qty),
    wasteFactor: num(u.wasteFactor),
    lineCost: num(u.lineCost),
    recipeTotalCost: num(u.recipeTotalCost),
  }))
  return ok(usages)
})
