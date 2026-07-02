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
}

/** BFF view returned to the composable layer for Widget A (forecast shopping list). */
export interface ForecastShoppingSuggestionsView {
  horizon: number;
  /** When true the forecast service has no completed run — show an empty state. */
  needsForecast: boolean;
  suggestions: ForecastShoppingItem[];
}

/**
 * Real stock coverage in days, computed by the backend from 30-day avg consumption.
 * `daysLeft: null` when `avgDailyConsumption === 0` (no recent movements).
 */
export interface IngredientCoverageView {
  ingredientId: string;
  currentStock: number;
  avgDailyConsumption: number;
  /** Lookback window used to compute the average (backend default: 30 days). */
  basedOnDays: number;
  /** null → no recent consumption; estimate is not possible. */
  daysLeft: number | null;
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
