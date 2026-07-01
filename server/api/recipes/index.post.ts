import { z } from "zod";
import { createRecipe } from "../../utils/e02-adapter";

const recipeItemSchema = z.object({
  ingredientId: z.string(),
  /** Presente cuando el ítem es una sub-receta; mutuamente excluyente con ingredientId. */
  subRecipeId: z.string().optional(),
  name: z.string(),
  qty: z.number().positive(),
  unit: z.string(),
  cost: z.number().nonnegative(),
  wastePct: z.number().min(0).max(100).default(0),
});

const createRecipeSchema = z.object({
  name: z.string().min(2),
  category: z.string().min(1),
  kind: z.enum(["dish", "sub_recipe"]).default("dish"),
  description: z.string().optional(),
  emoji: z.string().optional(),
  sellPrice: z.number().nonnegative(),
  items: z.array(recipeItemSchema).default([]),
  prepMinutes: z.number().int().positive().optional(),
  active: z.boolean().default(true),
});

// Crea la receta (BOM) y, si es plato, su MenuItem (precio/categoría) en el backend.
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, createRecipeSchema.parse);
  const recipe = await createRecipe(event, body);
  return ok(recipe);
});
