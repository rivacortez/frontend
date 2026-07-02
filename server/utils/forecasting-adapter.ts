import type { H3Event } from "h3";
import type {
  ForecastAccuracyView,
  ForecastContextStatus,
  ForecastDriver,
  ForecastInsightsView,
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

/**
 * Driver as emitted by the backend (`src/shared/forecasting/forecast.ts`,
 * `forecastDriverSchema`) — `kind` is a widened string (not the backend's
 * strict enum) because a still-unknown kind must survive the round trip and
 * degrade to a generic badge client-side, never throw during JSON parsing.
 */
interface BeForecastDriver {
  date: string;
  kind: string;
  label: string;
  impact_pct: number | null;
}

interface BeForecastShoppingSuggestionsData {
  horizon: number;
  source: "forecast";
  runId: string | null;
  needsForecast: boolean;
  suggestions: BeForecastSuggestion[];
  drivers: BeForecastDriver[];
  contextStatus: ForecastContextStatus | null;
}

interface BeForecastInsightsBacktest {
  modelSmape: number;
  baselineSmape: number;
  improvementPct: number;
  modelSmapeNoContext: number | null;
  contextImprovementPct: number | null;
}

interface BeForecastInsightsData {
  runId: string | null;
  status: "running" | "completed" | "failed" | null;
  contextStatus: ForecastContextStatus | null;
  horizon: number | null;
  generatedAt: string | null;
  upcomingDrivers: BeForecastDriver[];
  backtest: BeForecastInsightsBacktest | null;
  needsForecast: boolean;
}

/**
 * Accuracy point/metrics as emitted by `GET /forecasting/accuracy`
 * (`forecast-accuracy.ts` on team-backend) — already plain numbers, not
 * Decimal strings, since these are computed metrics rather than DB money.
 */
interface BeForecastAccuracyPoint {
  date: string;
  predicted: number;
  actual: number;
  yhatLo: number;
  yhatHi: number;
}

interface BeForecastAccuracyMetrics {
  smapeRealized: number | null;
  mapeRealized: number | null;
  coveragePct: number | null;
  points: number;
}

interface BeForecastAccuracyData {
  series: BeForecastAccuracyPoint[];
  metrics: BeForecastAccuracyMetrics;
  runsEvaluated: number;
  needsMoreData: boolean;
  message?: string;
}

const num = (s: string | null | undefined): number =>
  s == null ? 0 : Number(s);

/** Maps the backend's snake_case driver shape to the frontend's camelCase view. */
function toDriver(d: BeForecastDriver): ForecastDriver {
  return {
    date: d.date,
    kind: d.kind,
    label: d.label,
    impactPct: d.impact_pct,
  };
}

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
    return {
      horizon: h,
      needsForecast: true,
      suggestions: [],
      drivers: [],
      contextStatus: null,
    };
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
      // Cost to cover the gap itself (F2a "S/ en riesgo") — see the TSDoc on
      // `ForecastShoppingItem.shortfallCost` for why this stays separate
      // from `estimatedCost` even though both use `unitCost` today.
      shortfallCost: +(shortfall * unitCost).toFixed(2),
      reason: `Déficit de forecast: ${shortfall} ${s.unit}`,
      urgent: shortfall > 0,
      checked: false,
    };
  });

  return {
    horizon: h,
    needsForecast: false,
    suggestions,
    drivers: res.data.drivers.map(toDriver),
    contextStatus: res.data.contextStatus,
  };
}

/**
 * Fetches the narrated forecast summary from `GET /api/forecasting/insights`
 * (owner/manager only — the backend returns 403 for staff) and maps it to the
 * frontend `ForecastInsightsView`.
 *
 * Deliberately drops the raw backtest fields (`modelSmape`, `baselineSmape`,
 * `modelSmapeNoContext`, `contextImprovementPct`) before they reach the
 * client: those are academic backtest internals, not something a restaurant
 * owner should see, and `contextImprovementPct` can be negative on the demo
 * dataset (see engram HU-08-07 fase 2 notes) which would read as "the AI made
 * things worse" — misleading for a metric that isn't the point of the panel.
 * Only `improvementPct` (model vs. naive baseline) survives, as the single
 * credibility signal worth narrating.
 *
 * When `needsForecast` is true the tenant has no completed run yet — callers
 * MUST render an explicit empty/CTA state, not a panel with blank numbers.
 *
 * @param event Nitro H3 event (session token extracted server-side).
 */
export async function forecastInsights(
  event: H3Event,
): Promise<ForecastInsightsView> {
  const res = await backendFetch<Envelope<BeForecastInsightsData>>(
    event,
    "/api/forecasting/insights",
  );
  const { horizon, contextStatus, generatedAt, needsForecast, backtest } =
    res.data;

  return {
    needsForecast,
    contextStatus,
    horizon,
    generatedAt,
    upcomingDrivers: res.data.upcomingDrivers.map(toDriver),
    improvementPct: backtest?.improvementPct ?? null,
  };
}

/**
 * Fetches the forecast self-evaluation from `GET /api/forecasting/accuracy`
 * (HU-08-08, "el sistema se autoevalúa" — F2a) and maps it 1:1 to the
 * frontend `ForecastAccuracyView`. Unlike the shopping/insights adapters,
 * every numeric field here is already a plain number on the backend
 * (computed metrics, not Prisma `Decimal` money) — no string coercion needed.
 *
 * `needsMoreData: true` means too few elapsed forecast days exist for the
 * metrics to be representative (includes the 0-runs case). Callers MUST
 * render an explicit explanatory state, never a chart with near-empty data.
 *
 * @param event Nitro H3 event (session token extracted server-side).
 * @param scope 'total' (default) or 'menuItem' — same ambit as `/predictions`.
 * @param menuItemId Required by the backend when `scope === 'menuItem'`.
 */
export async function forecastAccuracy(
  event: H3Event,
  scope?: string,
  menuItemId?: string,
): Promise<ForecastAccuracyView> {
  const res = await backendFetch<Envelope<BeForecastAccuracyData>>(
    event,
    "/api/forecasting/accuracy",
    { query: { scope, menuItemId } },
  );
  return res.data;
}
