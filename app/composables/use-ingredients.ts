import type { ApiResponse } from "#shared/types/api";
import type { Ingredient } from "#shared/types/domain";

export function useIngredients(q?: MaybeRefOrGetter<string>) {
  return useQuery({
    key: () => ["ingredients", toValue(q) ?? ""] as const,
    query: () =>
      $fetch<ApiResponse<Ingredient[]>>("/api/ingredients", {
        query: { q: toValue(q) || undefined },
      }).then((r) => r.data),
  });
}

/** QA-06 · Una receta que usa el insumo (BOM real; el listado general trae items:[]). */
export interface RecipeUsage {
  recipeId: string;
  name: string;
  kind: string;
  emoji: string | null;
  qty: number;
  wasteFactor: number;
  lineCost: number;
  recipeTotalCost: number;
}

/**
 * QA-06 · Recetas que usan un insumo — panel "Usado en (N recetas)" del detalle.
 * Reactivo al id (refetch al cambiar de insumo). El backend resuelve el BOM real
 * (GET /api/ingredients/:id/recipes); no depende del listado de recetas, que
 * expone items:[] a propósito.
 */
export function useIngredientRecipes(id: MaybeRefOrGetter<string>) {
  return useQuery({
    key: () => ["ingredient-recipes", toValue(id)] as const,
    enabled: () => !!toValue(id),
    query: () =>
      $fetch<ApiResponse<RecipeUsage[]>>(
        `/api/ingredients/${toValue(id)}/recipes`,
      ).then((r) => r.data),
  });
}

export function useUpdateIngredient() {
  const cache = useQueryCache();
  return useMutation({
    mutation: ({
      id,
      ...payload
    }: {
      id: string;
      name?: string;
      category?: string;
      unit?: string;
      unitCost?: number;
      minStock?: number;
      stock?: number;
    }) =>
      $fetch<ApiResponse<Ingredient>>(`/api/ingredients/${id}`, {
        method: "PATCH",
        body: payload,
      }).then((r) => r.data),
    // El `minStock` afecta al inventario (E05) → invalidar también stock/alertas.
    onSettled: () =>
      Promise.all([
        cache.invalidateQueries({ key: ["ingredients"] }),
        cache.invalidateQueries({ key: ["stock-levels"] }),
        cache.invalidateQueries({ key: ["inventory-alerts"] }),
      ]),
  });
}

// HU-02-02 · Carga masiva de insumos vía CSV. Devuelve el reporte (creados/
// actualizados/errores con línea exacta). Es idempotente (rerun → actualiza).
export interface ImportReport {
  total: number;
  created: number;
  updated: number;
  failed: number;
  errors: { line: number; message: string }[];
}

export function useImportIngredients() {
  const cache = useQueryCache();
  return useMutation({
    mutation: (content: string) =>
      $fetch<ApiResponse<ImportReport>>("/api/ingredients/import", {
        method: "POST",
        body: { content },
      }).then((r) => r.data),
    onSettled: () => cache.invalidateQueries({ key: ["ingredients"] }),
  });
}
