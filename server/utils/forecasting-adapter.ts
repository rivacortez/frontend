import type { H3Event } from "h3";
import type {
  ForecastShoppingItem,
  ForecastShoppingSuggestionsView,
} from "#shared/types/domain";
import { backendFetch } from "./backend";
import { stockMap } from "./inventory-adapter";

/**
 * Anti-corruption adapter for the forecasting service (E08 / core-ai).
 * Maps backend decimal strings → numbers and joins with inventory stock for
 * cost estimation. The browser never calls these paths directly.
 */

interface Envelope<T> {
  success: boolean;
  data: T;
}

// ---- Backend shapes (all numeric fields are decimal strings) ----

interface BeForecastSuggestion {
  ingredientId: string;
  name: string;
  unit: string;
  currentStock: string;
  forecastConsumption: string;
  shortfall: string;
  suggestedQty: string;
}

interface BeForecastShoppingSuggestionsData {
  horizon: number;
  source: "forecast";
  runId: string | null;
  needsForecast: boolean;
  suggestions: BeForecastSuggestion[];
}

const num = (s: string | null | undefined): number =>
  s == null ? 0 : Number(s);

/**
 * Fetches demand-forecast shopping suggestions from `GET /api/forecasting/shopping-suggestions`
 * and maps them to the frontend `ForecastShoppingSuggestionsView`.
 *
 * Cost estimation (`estimatedCost`) is computed as `suggestedQty × unitCost` using
 * the live unit cost from `/api/inventory/stock`; this is a real, defensible number
 * (same approach as the alert-based list). It is 0 when no cost is registered.
 *
 * When `needsForecast` is true the backend has no completed forecast run yet.
 * Callers MUST surface this as an explicit empty state — never show zero items
 * as if the shopping list were simply empty.
 *
 * @param event  Nitro H3 event (session token extracted server-side).
 * @param horizon Forecast horizon in days (default 14).
 */
export async function forecastShoppingSuggestions(
  event: H3Event,
  horizon = 14,
): Promise<ForecastShoppingSuggestionsView> {
  const [res, stock] = await Promise.all([
    backendFetch<Envelope<BeForecastShoppingSuggestionsData>>(
      event,
      "/api/forecasting/shopping-suggestions",
      { query: { horizon } },
    ),
    stockMap(event),
  ]);

  const { horizon: h, needsForecast } = res.data;

  if (needsForecast) {
    return { horizon: h, needsForecast: true, suggestions: [] };
  }

  const suggestions: ForecastShoppingItem[] = res.data.suggestions.map((s) => {
    const suggestedQty = +num(s.suggestedQty).toFixed(2);
    const shortfall = +num(s.shortfall).toFixed(2);
    const unitCost = num(stock.get(s.ingredientId)?.unitCost);
    return {
      id: s.ingredientId,
      ingredientId: s.ingredientId,
      name: s.name,
      unit: s.unit,
      currentStock: +num(s.currentStock).toFixed(2),
      forecastConsumption: +num(s.forecastConsumption).toFixed(2),
      shortfall,
      suggestedQty,
      estimatedCost: +(suggestedQty * unitCost).toFixed(2),
      reason: `Déficit de forecast: ${shortfall} ${s.unit}`,
      urgent: shortfall > 0,
      checked: false,
    };
  });

  return { horizon: h, needsForecast: false, suggestions };
}
