import { z } from "zod";
import { requireMenuItemId } from "../../../utils/e02-adapter";
import { backendFetch } from "../../../utils/backend";

interface Envelope<T> {
  success: boolean;
  data: T;
}

/**
 * Vista devuelta por el backend `/api/costing/suggest-price`.
 * Todos los campos monetarios son strings (Decimal de Prisma).
 */
export interface SuggestPriceView {
  menuItemId: string;
  period: string;
  fullCost: string;
  targetMarginPct: string;
  suggestedPrice: string;
}

const querySchema = z.object({
  /** Margen objetivo en %. Rango [0, 99]. Default: 30. */
  targetMarginPct: z.coerce.number().min(0).max(99).default(30),
  /**
   * Ventana temporal para el cálculo. Debe coincidir con el patrón YYYY-MM que
   * valida el backend (`@Matches(/^\d{4}-\d{2}$/)`). Por defecto, el mes actual
   * computado en tiempo de request (no de módulo) para sobrevivir reinicios largos.
   */
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Formato YYYY-MM requerido').default(
    () => new Date().toISOString().slice(0, 7),
  ),
});

/**
 * BFF para obtener el precio sugerido por la IA de costeo de un plato.
 *
 * Acepta `recipeId` como parámetro de ruta (`:id`) y lo resuelve internamente
 * al `menuItemId` que requiere el backend — el cliente Vue nunca necesita conocer
 * el menuItemId. Delega la autorización (staff → 403) al backend.
 *
 * GET /api/recipes/:id/suggest-price?targetMarginPct=30&period=month
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Falta el id de la receta",
    });
  }

  const { targetMarginPct, period } = await getValidatedQuery(
    event,
    querySchema.parse,
  );

  // Resuelve recipeId → menuItemId (lanza 400 si la receta no es un plato vendible).
  const menuItemId = await requireMenuItemId(event, id);

  const res = await backendFetch<Envelope<SuggestPriceView>>(
    event,
    "/api/costing/suggest-price",
    { query: { menuItemId, targetMarginPct, period } },
  );

  return ok(res.data);
});
