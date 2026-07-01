import { z } from 'zod'
import { updateRecipe } from '../../utils/e02-adapter'

const patchRecipeSchema = z.object({
  name: z.string().min(2).optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  emoji: z.string().optional(),
  sellPrice: z.number().nonnegative().optional(),
  items: z.array(z.object({
    ingredientId: z.string(),
    /** Presente cuando el ítem es una sub-receta; mutuamente excluyente con ingredientId. */
    subRecipeId: z.string().optional(),
    name: z.string(),
    qty: z.number().positive(),
    unit: z.string(),
    cost: z.number().nonnegative(),
    wastePct: z.number().min(0).max(100),
  })).optional(),
  prepMinutes: z.number().int().positive().optional(),
  active: z.boolean().optional(),
})

// Reparte el patch: BOM/presentación → Recipe; precio/estado/categoría → MenuItem.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Falta el id' })
  }
  const body = await readValidatedBody(event, patchRecipeSchema.parse)
  return ok(await updateRecipe(event, id, body))
})
