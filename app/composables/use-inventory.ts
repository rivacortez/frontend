import type { ApiResponse } from "#shared/types/api";
import type {
  ForecastShoppingItem,
  ForecastShoppingSuggestionsView,
  Ingredient,
  IngredientCoverageView,
  InventoryMovement,
  MovementType,
  PriceTrendPoint,
  ShoppingItem,
  StockStatus,
} from "#shared/types/domain";

// ===== Stock (E05, HU-05-01) =====
// Vista canónica del stock por insumo, directa del backend (dinero/cantidades string).
export interface StockLevel {
  ingredientId: string;
  name: string;
  unit: string;
  unitCost: string;
  stock: string;
  minStock: string;
  status: StockStatus;
}

export function useStockLevels() {
  return useQuery({
    key: ["stock-levels"],
    query: () =>
      $fetch<ApiResponse<StockLevel[]>>("/api/inventory/stock").then(
        (r) => r.data,
      ),
  });
}

// ===== Movimientos (kardex) =====
export function useMovements(
  ingredientId?: MaybeRefOrGetter<string | undefined>,
) {
  return useQuery({
    key: () => ["movements", toValue(ingredientId) ?? "all"] as const,
    query: () =>
      $fetch<ApiResponse<InventoryMovement[]>>("/api/inventory/movements", {
        query: { ingredientId: toValue(ingredientId) || undefined },
      }).then((r) => r.data),
  });
}

export function useCreateMovement() {
  const cache = useQueryCache();
  return useMutation({
    // `reason` es obligatorio cuando type='waste' (merma) — lo exige el backend.
    mutation: (payload: {
      ingredientId: string;
      type: MovementType;
      qty: number;
      note?: string;
      reason?: string;
      user?: string;
    }) =>
      $fetch<
        ApiResponse<{
          movement: InventoryMovement;
          ingredient: Ingredient | undefined;
        }>
      >("/api/inventory/movements", { method: "POST", body: payload }).then(
        (r) => r.data,
      ),
    onSettled: () =>
      Promise.all([
        cache.invalidateQueries({ key: ["movements"] }),
        cache.invalidateQueries({ key: ["ingredients"] }),
        cache.invalidateQueries({ key: ["stock-levels"] }),
        cache.invalidateQueries({ key: ["inventory-alerts"] }),
        cache.invalidateQueries({ key: ["inventory-waste"] }),
      ]),
  });
}

// ===== Alertas de stock bajo (E05, HU-05-10) =====
export interface StockAlert {
  ingredientId: string;
  name: string;
  unit: string;
  stock: string;
  minStock: string;
  deficit: string;
  status: StockStatus;
}

export function useAlerts() {
  return useQuery({
    key: ["inventory-alerts"],
    query: () =>
      $fetch<ApiResponse<StockAlert[]>>("/api/inventory/alerts").then(
        (r) => r.data,
      ),
  });
}

// ===== Mermas (E05, HU-05-09) =====
export interface WasteHistory {
  items: InventoryMovement[];
  totalWasteCost: number;
}

export function useWaste() {
  return useQuery({
    key: ["inventory-waste"],
    query: () =>
      $fetch<ApiResponse<WasteHistory>>("/api/inventory/waste").then(
        (r) => r.data,
      ),
  });
}

// ===== Lista de Compras (conveniencia client-side, sembrada de alertas) =====
// El backend NO persiste una lista de compras (ver frontend_context.md §11c). La
// lista es la vista de alertas (server) + un **overlay reactivo en el cliente**:
// los ítems agregados a mano y el estado "marcado" viven aquí (sobreviven a los
// refetch). "Registrar compras" crea movimientos `purchase` reales.
interface ShoppingOverlay {
  checked: Record<string, boolean>; // ingredientId → marcado
  extra: ShoppingItem[]; // ítems agregados a mano (no provienen de alertas)
}

function useShoppingOverlay() {
  return useState<ShoppingOverlay>("shopping-overlay", () => ({
    checked: {},
    extra: [],
  }));
}

export function useShoppingList() {
  const overlay = useShoppingOverlay();
  const query = useQuery({
    key: ["shopping-list"],
    query: () =>
      $fetch<ApiResponse<ShoppingItem[]>>("/api/inventory/shopping-list").then(
        (r) => r.data,
      ),
  });

  // Fusiona la semilla (alertas) con el overlay: ítems extra primero no duplicados,
  // y el estado `checked` del overlay manda.
  const data = computed<ShoppingItem[]>(() => {
    const seed = query.data.value ?? [];
    const seedIds = new Set(seed.map((s) => s.ingredientId));
    const extra = overlay.value.extra.filter(
      (e) => !seedIds.has(e.ingredientId),
    );
    return [...seed, ...extra].map((item) => ({
      ...item,
      checked: overlay.value.checked[item.ingredientId] ?? item.checked,
    }));
  });

  return { ...query, data };
}

export function usePatchShoppingItem() {
  const overlay = useShoppingOverlay();
  return useMutation({
    mutation: ({
      id,
      checked,
      suggestedQty,
    }: {
      id: string;
      checked?: boolean;
      suggestedQty?: number;
    }) => {
      // `id` === ingredientId (la lista no se persiste).
      if (checked !== undefined)
        overlay.value.checked = { ...overlay.value.checked, [id]: checked };
      if (suggestedQty !== undefined) {
        const e = overlay.value.extra.find((x) => x.ingredientId === id);
        if (e) e.suggestedQty = suggestedQty;
      }
      return Promise.resolve({ id, checked, suggestedQty });
    },
  });
}

/**
 * Tras registrar las compras: limpia el estado "marcado" y quita del overlay los
 * ítems agregados a mano que ya se compraron (las alertas se recalculan solas al
 * subir el stock).
 */
export function useClearPurchased() {
  const overlay = useShoppingOverlay();
  return (ingredientIds: string[]) => {
    const ids = new Set(ingredientIds);
    const checked = { ...overlay.value.checked };
    for (const id of ids) delete checked[id];
    overlay.value = {
      checked,
      extra: overlay.value.extra.filter((e) => !ids.has(e.ingredientId)),
    };
  };
}

// ===== Forecast-driven shopping suggestions (Widget A — E08 / core-ai) =====

/**
 * Returns demand-forecast shopping suggestions from the backend forecasting
 * service. When `needsForecast` is true the core-ai model has not produced a
 * forecast run yet — callers MUST show an explicit empty state, never an empty
 * list that looks like "nothing to buy".
 *
 * The returned `suggestions` are already merged with the client-side checked
 * overlay (same `shopping-overlay` useState as `useShoppingList`) so the
 * register-purchase flow works without changes.
 */
export function useForecastShoppingSuggestions() {
  const overlay = useShoppingOverlay();
  const query = useQuery({
    key: ["forecast-shopping-suggestions"],
    query: () =>
      $fetch<ApiResponse<ForecastShoppingSuggestionsView>>(
        "/api/forecasting/shopping-suggestions",
      ).then((r) => r.data),
  });

  /** Suggestions merged with the checked overlay; empty when `needsForecast`. */
  const suggestions = computed<ForecastShoppingItem[]>(() => {
    const res = query.data.value;
    if (!res || res.needsForecast) return [];
    return res.suggestions.map((item) => ({
      ...item,
      checked: overlay.value.checked[item.ingredientId] ?? false,
    }));
  });

  return {
    ...query,
    suggestions,
    /** Forecast horizon in days (default 14). */
    horizon: computed(() => query.data.value?.horizon ?? 14),
    /**
     * True when the backend has no completed forecast run yet.
     * Distinguish this from an empty suggestions list (stock fully covered).
     */
    needsForecast: computed(() => query.data.value?.needsForecast ?? false),
    /** Exogenous drivers (holiday/gastro_event/weather/weekend/…) within the forecast window. */
    drivers: computed(() => query.data.value?.drivers ?? []),
    /**
     * Context status of the run backing `suggestions` (HU-08-07 fase 2).
     * `calendar_only` → weather was unreachable when the run generated the
     * data; the UI shows a discreet note instead of treating it as an error.
     */
    contextStatus: computed(() => query.data.value?.contextStatus ?? null),
  };
}

// ===== Ingredient stock coverage (Widget B) =====

/**
 * Real stock coverage in days for the given ingredient, derived from the
 * backend's 30-day average consumption. Use this instead of the local heuristic
 * `status → hardcoded days`. When `data.daysLeft` is null, show
 * "sin consumo reciente para estimar" — do NOT default to a placeholder number.
 */
export function useIngredientCoverage(ingredientId: MaybeRefOrGetter<string>) {
  return useQuery({
    key: () => ["ingredient-coverage", toValue(ingredientId)] as const,
    query: () =>
      $fetch<ApiResponse<IngredientCoverageView>>(
        `/api/inventory/coverage/${toValue(ingredientId)}`,
      ).then((r) => r.data),
  });
}

// ===== Ingredient price trend (Widget C) =====

/**
 * Price-history data points for the given ingredient (purchase orders + manual
 * adjustments), newest-first from the backend. Reverse the array for
 * chronological display. Fewer than 2 points → no percentage change is computable.
 */
export function useIngredientPriceTrend(
  ingredientId: MaybeRefOrGetter<string>,
) {
  return useQuery({
    key: () => ["ingredient-price-trend", toValue(ingredientId)] as const,
    query: () =>
      $fetch<ApiResponse<PriceTrendPoint[]>>(
        `/api/inventory/price-trend/${toValue(ingredientId)}`,
      ).then((r) => r.data),
  });
}

export function useAddShoppingItem() {
  const overlay = useShoppingOverlay();
  return useMutation({
    // Resuelve el insumo real del catálogo para nombre/unidad/costo y lo agrega al
    // overlay como ítem sugerido (sin persistencia en el backend).
    mutation: async (payload: {
      ingredientId: string;
      suggestedQty?: number;
    }) => {
      const ingredients = await $fetch<ApiResponse<Ingredient[]>>(
        "/api/ingredients",
      ).then((r) => r.data);
      const ing = ingredients.find((i) => i.id === payload.ingredientId);
      if (!ing) throw new Error("Insumo no encontrado");
      const qty =
        payload.suggestedQty ??
        Math.max(1, +(ing.minStock * 2 - ing.stock).toFixed(2));
      const existing = overlay.value.extra.find(
        (x) => x.ingredientId === ing.id,
      );
      if (existing) {
        existing.suggestedQty = +(existing.suggestedQty + qty).toFixed(2);
        existing.estimatedCost = +(
          existing.suggestedQty * ing.unitCost
        ).toFixed(2);
        overlay.value.checked = { ...overlay.value.checked, [ing.id]: false };
        return existing;
      }
      const item: ShoppingItem = {
        id: ing.id,
        ingredientId: ing.id,
        name: ing.name,
        suggestedQty: qty,
        unit: ing.unit,
        estimatedCost: +(qty * ing.unitCost).toFixed(2),
        reason: "Agregado manualmente",
        urgent: ing.minStock > 0 && ing.stock < ing.minStock,
        checked: false,
      };
      overlay.value.extra = [...overlay.value.extra, item];
      return item;
    },
  });
}
