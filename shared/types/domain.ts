/**
 * Entidades de dominio que consume el frontend (frontend_context.md §7).
 * Mismo contrato que expondrá la API NestJS; hoy las sirve el mock BFF
 * (`server/api/**` + `server/utils/mock-db.ts`).
 */

// ===== Catálogo =====

export type RecipeKind = "dish" | "sub_recipe";

export type StockStatus = "ok" | "low" | "critical";

export interface Ingredient {
  id: string;
  name: string;
  category: string;
  unit: string;
  unitCost: number;
  stock: number;
  minStock: number;
  updatedAt: string;
  /**
   * Estado del stock frente al mínimo de reorden, calculado por Inventario (E05):
   * `critical` ≤ min·0.5, `low` < min, si no `ok`. El BFF lo fusiona desde
   * `GET /api/inventory/stock`.
   */
  status?: StockStatus;
}

export interface RecipeItem {
  /** Ingredient catalog ID. Mutually exclusive with `subRecipeId`. */
  ingredientId: string;
  /**
   * Sub-recipe reference ID (HU-02-08). When set, this BOM line uses another
   * recipe as a component instead of a raw ingredient; `ingredientId` is empty.
   */
  subRecipeId?: string;
  name: string;
  qty: number;
  unit: string;
  cost: number;
  wastePct: number;
}

export interface Recipe {
  id: string;
  name: string;
  category: string;
  kind: RecipeKind;
  description?: string;
  emoji?: string;
  sellPrice: number;
  cost: number;
  marginPct: number;
  items: RecipeItem[];
  active: boolean;
  soldToday: number;
  prepMinutes?: number;
  /**
   * BOM version counter (HU-02-09). Increments on each `PATCH /recipes/:id`
   * that modifies the ingredient list. Useful for change auditing.
   */
  version?: number;
}

// ===== POS / Salón =====

export type TableStatus = "free" | "occupied" | "bill" | "reserved";

export interface DiningTable {
  id: string;
  number: number;
  zone: string;
  seats: number;
  status: TableStatus;
  openedAt?: string;
  orderId?: string;
  waiter?: string;
  guests?: number;
}

export type OrderItemStatus = "pending" | "preparing" | "served";

export interface OrderItem {
  id: string;
  recipeId: string;
  name: string;
  qty: number;
  unitPrice: number;
  notes?: string;
  status: OrderItemStatus;
}

export type DiscountType = "pct" | "amount";

export interface OrderDiscount {
  type: DiscountType;
  value: number;
  reason?: string;
}

/**
 * Descuento tal como aparece en las vistas CALCULADAS (pre-cuenta, división y
 * comprobante): además del `type`/`value`/`reason` capturados, incluye el
 * `amount` en soles que el backend efectivamente restó del bruto ANTES de
 * partir el IGV. Convención de moneda: string en las vistas de moneda-string
 * (PreBill/SplitResult) y number en `Sale` (que ya convierte a number).
 */
export interface PreBillDiscount {
  type: DiscountType;
  value: string;
  reason?: string;
  amount: string;
}

export interface SaleDiscount {
  type: DiscountType;
  value: number;
  reason?: string;
  amount: number;
}

export type PaymentMethod = "cash" | "card" | "yape" | "plin";

export interface OrderPayment {
  method: PaymentMethod;
  amount: number;
}

export type OrderStatus = "open" | "paid" | "void";

export interface Order {
  id: string;
  tableId: string;
  openedAt: string;
  items: OrderItem[];
  discount?: OrderDiscount;
  payments: OrderPayment[];
  status: OrderStatus;
}

// ===== Ventas / Comprobantes =====

export type SaleDocType = "boleta" | "factura";
export type SaleStatus = "issued" | "void";

export interface SaleItem {
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface Sale {
  id: string;
  serie: string;
  number: number;
  docType: SaleDocType;
  date: string;
  tableLabel?: string;
  customer?: string;
  customerDoc?: string;
  items: SaleItem[];
  // `grossTotal`/`discount` solo vienen cuando la venta llevó descuento (E04);
  // `subtotal`/`igv`/`total` ya reflejan el descuento restado.
  grossTotal?: number;
  discount?: SaleDiscount | null;
  subtotal: number;
  igv: number;
  total: number;
  method: PaymentMethod;
  status: SaleStatus;
}

// HU-04-01 · Pre-cuenta (preview, no persiste). Totales autoritativos del backend
// (moneda string, igual que `SaleView`). El frontend solo los muestra.
export interface PreBillLine {
  name: string;
  qty: number;
  unitPrice: string;
  lineTotal: string;
}

export interface PreBill {
  orderId: string;
  tableCode: string;
  items: PreBillLine[];
  // Bruto (antes de descuento) + descuento aplicado. `subtotal`/`igv`/`total`
  // ya vienen con el descuento restado ANTES de partir el IGV.
  grossTotal: string;
  discount: PreBillDiscount | null;
  subtotal: string;
  igv: string;
  total: string;
}

// HU-04-03 · División de la cuenta (cómputo de display, no persiste).
export interface SplitShare {
  label: string;
  subtotal: string;
  igv: string;
  total: string;
}

export interface SplitResult {
  orderId: string;
  mode: "equal" | "items";
  // Bruto + descuento del pedido; el backend reparte el total YA con descuento
  // de forma proporcional entre las partes (`shares`).
  grossTotal: string;
  discount: PreBillDiscount | null;
  shares: SplitShare[];
  total: string;
}

// ===== Inventario =====

export type MovementType =
  "purchase" | "sale" | "waste" | "adjustment" | "count";

export interface InventoryMovement {
  id: string;
  ingredientId: string;
  ingredientName: string;
  type: MovementType;
  qty: number;
  unit: string;
  date: string;
  note?: string;
  user?: string;
}

export interface ShoppingItem {
  id: string;
  ingredientId: string;
  name: string;
  suggestedQty: number;
  unit: string;
  estimatedCost: number;
  reason: string;
  urgent: boolean;
  checked: boolean;
}

/**
 * Shopping suggestion derived from the demand forecast (E08 / core-ai).
 * Extends `ShoppingItem` so overlay/register-purchase flows work unchanged.
 * `currentStock` and `shortfall` surface the forecast gap in the detail panel.
 */
export interface ForecastShoppingItem extends ShoppingItem {
  currentStock: number;
  forecastConsumption: number;
  shortfall: number;
  /**
   * `shortfall × unitCost` — the cost of covering the projected demand gap
   * (F2a "S/ en riesgo"). Deliberately DISTINCT from `estimatedCost`
   * (`suggestedQty × unitCost`, the recommended purchase): the backend
   * currently sets `suggestedQty = shortfall` (see
   * `shopping-suggestions.ts` on team-backend) so they read the same today,
   * but `suggestedQty` is documented to diverge once purchase-lot rounding
   * ships — `shortfallCost` must keep meaning "cost to cover the gap", not
   * "cost of the recommended purchase", regardless of future lot sizing.
   */
  shortfallCost: number;
  /**
   * True when the backend reduced `suggestedQty` below what the demand gap
   * (`shortfall`) alone would call for, because buying more would spoil before
   * it can be consumed (shelf-life-aware purchasing, B4). When true, prefer
   * showing `uncappedSuggestedQty` alongside `suggestedQty` so the reduction
   * is legible rather than looking like a rounding artifact.
   */
  cappedByShelfLife: boolean;
  /**
   * The quantity that would have been suggested WITHOUT the shelf-life cap
   * (i.e. `shortfall`-based, pre-adjustment). Null when `cappedByShelfLife` is
   * false — there is nothing to contrast `suggestedQty` against.
   */
  uncappedSuggestedQty: number | null;
}

/**
 * Known exogenous driver kinds surfaced by the demand forecast (E08 / HU-08-07).
 * Kept as a union for icon/label mapping, but `ForecastDriver.kind` is widened
 * to accept unrecognized strings too (see note there) — core-ai is adding
 * `"payday"` in parallel and may introduce further kinds later; the UI must
 * degrade to a generic badge instead of breaking.
 */
export type KnownForecastDriverKind =
  "holiday" | "gastro_event" | "weather" | "weekend" | "payday";

/**
 * Context status of the forecast run backing a response.
 * `full` = calendar + weather resolved · `calendar_only` = Open-Meteo was
 * unreachable, calendar-based drivers (holiday/gastro_event/weekend/payday)
 * still apply · `off` = context was not requested (never happens for the
 * business runs the UI reads from).
 */
export type ForecastContextStatus = "full" | "calendar_only" | "off";

/**
 * A single narratable exogenous factor within the forecast window (e.g. "Día
 * del Ceviche" or "Fin de semana"). `impactPct` is the historical average
 * uplift/drop for that kind of day vs. an equivalent day without it; `null`
 * when the backend has no prior occurrence to compare against — the UI must
 * show the event without inventing a number.
 *
 * `kind` is intentionally widened past {@link KnownForecastDriverKind} (`string &
 * {}` keeps autocomplete for known values while still accepting anything the
 * backend sends) so a still-unknown kind renders as a generic badge instead of
 * a type error or a runtime crash.
 */
export interface ForecastDriver {
  date: string;
  kind: KnownForecastDriverKind | (string & {});
  label: string;
  impactPct: number | null;
}

/** BFF view returned to the composable layer for Widget A (forecast shopping list). */
export interface ForecastShoppingSuggestionsView {
  horizon: number;
  /** When true the forecast service has no completed run — show an empty state. */
  needsForecast: boolean;
  suggestions: ForecastShoppingItem[];
  /** Exogenous drivers within the forecast window; `[]` when `needsForecast`. */
  drivers: ForecastDriver[];
  /** Context status of the run backing `suggestions`; `null` when `needsForecast`. */
  contextStatus: ForecastContextStatus | null;
}

/**
 * Narrated summary for the dashboard "Lo que se viene" panel (owner/manager,
 * E08 / HU-08-07 fase 3). Deliberately does NOT expose raw sMAPE or the
 * context-vs-no-context academic comparison (`contextImprovementPct`) — those
 * are backtest internals, not meaningful (and sometimes negative on demo
 * data) to a restaurant owner. `improvementPct` is the one credibility signal
 * worth narrating: how much better the model is than the naive baseline.
 */
export interface ForecastInsightsView {
  /** True when the tenant has no completed forecast run yet. */
  needsForecast: boolean;
  contextStatus: ForecastContextStatus | null;
  horizon: number | null;
  /** ISO timestamp of the run used; `null` when `needsForecast`. */
  generatedAt: string | null;
  /** Drivers with `date >= today (Lima)`, already bounded by the backend. */
  upcomingDrivers: ForecastDriver[];
  /** Model accuracy vs. the naive baseline, in percent; `null` when unavailable. */
  improvementPct: number | null;
}

/**
 * A single already-elapsed day: what the forecast predicted (with its
 * [yhatLo, yhatHi] band) vs. what actually sold, per
 * `GET /forecasting/accuracy` (HU-08-08, "el sistema se autoevalúa").
 */
export interface ForecastAccuracyPoint {
  date: string;
  predicted: number;
  actual: number;
  yhatLo: number;
  yhatHi: number;
}

/**
 * Aggregate accuracy metrics over `series`. `smapeRealized`/`mapeRealized`
 * are REALIZED error (predicted vs. real sales), not the model's internal
 * backtest — see `ForecastInsightsView.improvementPct` for that. `null`
 * when there are 0 comparable points. `coveragePct` = % of days whose real
 * value fell inside [yhatLo, yhatHi] (interval calibration).
 */
export interface ForecastAccuracyMetrics {
  smapeRealized: number | null;
  mapeRealized: number | null;
  coveragePct: number | null;
  points: number;
}

/**
 * View for the "Precisión del pronóstico" screen (F2a) — the thesis's
 * self-evaluation evidence. `needsMoreData: true` means too few elapsed
 * forecast days exist yet for the metrics to be meaningful (includes the
 * zero-runs case); the UI MUST show an explanatory state, never a chart
 * with near-empty data. `message` carries the backend's explanation in that
 * case.
 */
export interface ForecastAccuracyView {
  series: ForecastAccuracyPoint[];
  metrics: ForecastAccuracyMetrics;
  /** Number of completed forecast runs that contributed at least one elapsed day. */
  runsEvaluated: number;
  needsMoreData: boolean;
  message?: string;
}

/**
 * Freshness state of an ingredient, computed server-side from its shelf life
 * and last purchase date. `null` (on {@link IngredientCoverageView}) means the
 * backend has nothing to base a freshness estimate on — either the ingredient
 * has no purchase history yet, or it isn't tracked for perishability.
 */
export type FreshnessStatus = "fresh" | "expiring_soon" | "expired";

/**
 * Real stock coverage in days, computed by the backend from 30-day avg
 * consumption, extended with shelf-life/freshness data (B4). `daysLeft: null`
 * when `avgDailyConsumption === 0` (no recent movements).
 *
 * The freshness fields (`shelfLifeDays` through `atRiskCost`) are ALL derived
 * server-side from the ingredient's last purchase — the frontend never
 * recomputes expiry math (no FEFO, no lot tracking) here, it only presents
 * these values. `lastPurchaseAt`/`estimatedExpiryAt`/`freshnessStatus`/
 * `atRiskQty`/`atRiskCost` are `null` together when there is no purchase to
 * anchor a freshness estimate on.
 */
export interface IngredientCoverageView {
  ingredientId: string;
  currentStock: number;
  avgDailyConsumption: number;
  /** Lookback window used to compute the average (backend default: 30 days). */
  basedOnDays: number;
  /** null → no recent consumption; estimate is not possible. */
  daysLeft: number | null;
  /** Shelf life configured for this ingredient, in days. */
  shelfLifeDays: number;
  /** ISO date of the last registered purchase, or null if none exists. */
  lastPurchaseAt: string | null;
  /** `lastPurchaseAt + shelfLifeDays`, or null when `lastPurchaseAt` is null. */
  estimatedExpiryAt: string | null;
  /** Server-computed freshness state; null when no purchase anchors the estimate. */
  freshnessStatus: FreshnessStatus | null;
  /**
   * The real stock coverage in days: `min(daysLeft, daysUntilExpiry)`. This is
   * the figure the UI should present as the headline number — whichever
   * constraint (running out vs. spoiling) is tighter is what actually limits
   * usable stock. Null only when both `daysLeft` and the expiry estimate are
   * unknown.
   */
  effectiveCoverageDays: number | null;
  /**
   * Quantity projected to spoil before it can be consumed, given the demand
   * pace — null when there is no freshness tracking for this ingredient.
   */
  atRiskQty: number | null;
  /** PEN value of `atRiskQty`; null under the same conditions. */
  atRiskCost: number | null;
}

/** Single price-history data point from a purchase order or manual adjustment. */
export interface PriceTrendPoint {
  recordedAt: string;
  unitCost: number;
  source: "purchase_order" | "manual";
}

/**
 * Sales-based order upsell suggestion. NOT machine-learning — top-sellers from
 * historical sales not already present in the current order. `recipeId` is resolved
 * by the BFF from the backend's `menuItemId` so the cart can add it directly.
 */
export interface OrderSuggestionView {
  menuItemId: string;
  /** Resolved by BFF via menu maps (falls back to menuItemId on lookup miss). */
  recipeId: string;
  name: string;
  price: number;
  timesSold: number;
}

// ===== Órdenes de Compra (E05 Inc2) =====
// Dinero/cantidades como string (autoritativos del backend); la UI los formatea.
export type PurchaseOrderStatus =
  "draft" | "sent" | "partially_received" | "received" | "cancelled";

export interface PurchaseOrderItem {
  id: string;
  ingredientId: string;
  ingredientName: string;
  qtyOrdered: string;
  qtyReceived: string;
  unitCost: string;
  lineTotal: string;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  expectedAt: string | null;
  notes: string | null;
  items: PurchaseOrderItem[];
  total: string;
}

// ===== Notificaciones =====

export type NotificationKind = "critical" | "warning" | "info" | "success";

/** Tipo de dominio del backend (E10, `notificationTypeSchema`). */
export type NotificationType =
  "low_stock" | "order_ready" | "bill_requested" | "system";

export interface AppNotification {
  id: string;
  /** Severidad visual (icono/color). Derivada del `type` del backend. */
  kind: NotificationKind;
  /** Tipo de dominio real del backend (para etiqueta/filtrado). */
  type: NotificationType;
  title: string;
  body: string;
  date: string;
  read: boolean;
  actionLabel?: string;
  actionTo?: string;
}

// ===== Settings =====

export interface BusinessSettings {
  name: string;
  legalName: string;
  ruc: string;
  address: string;
  district: string;
  phone: string;
  email: string;
}

export interface DayHours {
  day: string;
  opens: string;
  closes: string;
  closed: boolean;
}

export interface HoursSettings {
  days: DayHours[];
}

export interface PaymentsSettings {
  cash: boolean;
  card: boolean;
  yape: boolean;
  plin: boolean;
  tipPct: number;
}

export interface TableZone {
  id: string;
  name: string;
  tables: number;
}

export interface TablesSettings {
  zones: TableZone[];
}

export interface TaxSettings {
  igvPct: number;
  pricesIncludeTax: boolean;
  boletaSerie: string;
  facturaSerie: string;
}

export interface MenuSettings {
  showPrices: boolean;
  showUnavailable: boolean;
  highlightPromos: boolean;
}

export interface AppSettings {
  business: BusinessSettings;
  hours: HoursSettings;
  payments: PaymentsSettings;
  tables: TablesSettings;
  tax: TaxSettings;
  menu: MenuSettings;
}

// ===== Chat analítico =====

export interface ChatTableData {
  columns: string[];
  /**
   * Table rows from the generated SQL query. Cells may be null (SQL NULL),
   * numbers, or strings depending on the column type.
   */
  rows: (string | number | null)[][];
}

/**
 * Classification of a chat question, computed server-side BEFORE deciding
 * whether to call the NL2SQL pipeline (F2b / LOTE B3, backend
 * `intent-classifier.util.ts`). `historical` is the original R1-R10 flow
 * (unchanged). Optional/absent on legacy responses that predate this field —
 * callers must treat a missing `kind` as `historical`.
 */
export type ChatQueryKind =
  "historical" | "future" | "out_of_domain" | "ambiguous";

/**
 * Single day within a `ChatForecastMeta.points` array. Mirrors the backend's
 * `forecastPointSchema` (core-ai contract), mapped from snake_case at the BFF.
 */
export interface ChatForecastPoint {
  targetDate: string;
  yhat: number;
  yhatLo: number;
  yhatHi: number;
}

/** Resolved date range the user asked about (e.g. "este fin de semana"). */
export interface ChatForecastRange {
  from: string;
  to: string;
  label: string;
}

/**
 * Backend-declared derivation of the unit forecast into an estimated money
 * amount (QA-23), using the tenant's average ticket price over a recent
 * window. `null` when there is not enough recent sales history to derive a
 * price — the UI must then show units only, never a fabricated currency
 * figure.
 */
export interface ChatForecastEstimatedRevenue {
  total: number;
  lo: number;
  hi: number;
  /** Average unit price (PEN) used for the derivation. */
  avgUnitPrice: number;
  /** Size (in days) of the recent-sales window the average price was computed over. */
  basisDays: number;
}

/**
 * Structured forecast payload attached to a `kind: 'future'` chat response
 * when the backend had a completed run covering the requested range (F2b /
 * LOTE B3). Carries the SAME numbers already narrated in `ChatMessage.content`
 * as plain text, but in a shape the UI can render as a compact visual block
 * (total + band, day-by-day breakdown, drivers) instead of parsing the
 * answer string. Absent when `kind === 'future'` but the backend had no data
 * for the range (e.g. `needsForecast`/out-of-horizon) — in that case only
 * `content` carries the explanation.
 *
 * IMPORTANT (QA-23): `totalYhat`/`totalLo`/`totalHi` and every `points[]`
 * entry are expressed in UNITS (see `unitLabel`, e.g. "platos"), never in
 * currency. `estimatedRevenue` is a separate, explicitly-derived money figure
 * — render it as a secondary line, not as the headline number.
 */
export interface ChatForecastMeta {
  /** `ForecastRun` id backing these numbers — for traceability/audit. */
  runId: string;
  range: ChatForecastRange;
  totalYhat: number;
  totalLo: number;
  totalHi: number;
  /** Day-level breakdown within `range`. */
  points: ChatForecastPoint[];
  /** Exogenous drivers (holidays, payday, weather...) within the same range. */
  drivers: ForecastDriver[];
  /**
   * Unit of `totalYhat`/`totalLo`/`totalHi`/`points[].yhat*` (e.g. "platos").
   * Optional — absent on legacy responses fetched before this field shipped
   * (an already-rendered message in an open chat thread); treat a missing
   * value as unitless rather than defaulting to currency.
   */
  unitLabel?: string;
  /**
   * Money estimate derived from the unit forecast, or `null` when the
   * backend had no recent sales to derive a price from. Absent (not just
   * `null`) on legacy responses — see `unitLabel`.
   */
  estimatedRevenue?: ChatForecastEstimatedRevenue | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sql?: string;
  table?: ChatTableData;
  /**
   * AI provider that computed the answer (e.g. "mock", "openai").
   * Only present on assistant turns from the real backend.
   */
  provider?: string;
  /** Model identifier from the provider (e.g. "gpt-4o"). */
  model?: string;
  /** ADDITIVE (F2b) — question classification; absent on legacy responses. */
  kind?: ChatQueryKind;
  /** ADDITIVE (F2b) — present only when `kind === 'future'` and data was available. */
  forecast?: ChatForecastMeta;
  createdAt: string;
}

// ===== Ingesta de datos =====

export type IngestionStatus = "queued" | "processing" | "success" | "error";

export interface IngestionError {
  row: number;
  field: string;
  message: string;
}

export interface Ingestion {
  id: string;
  fileName: string;
  source: string;
  status: IngestionStatus;
  totalRows: number;
  processedRows: number;
  errors: IngestionError[];
  createdAt: string;
}

// ===== Cierre Z / caja (HU-04-08) =====
// Totales del turno por método de pago (siempre las 4 claves). Dinero como string
// (autoritativo del backend); la UI solo lo formatea.
export type CashByMethod = Record<"cash" | "card" | "yape" | "plin", string>;

/** Preview del turno abierto (no persiste): agregado de ventas desde el último cierre. */
export interface CashClosePreview {
  periodStart: string | null;
  salesCount: number;
  voidCount: number;
  totalGross: string;
  byMethod: CashByMethod;
  openSince: string | null;
}

/** Cierre Z persistido (inmutable). */
export interface CashClose {
  id: string;
  openedAt: string;
  closedAt: string;
  salesCount: number;
  voidCount: number;
  totalGross: string;
  byMethod: CashByMethod;
  userId: string | null;
}
