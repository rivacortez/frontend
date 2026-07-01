import type { H3Event } from "h3";
import type {
  IngredientCoverageView,
  InventoryMovement,
  MovementType,
  PriceTrendPoint,
  ShoppingItem,
  StockStatus,
} from "#shared/types/domain";
import { backendFetch } from "./backend";

/**
 * Adaptador E05 (anti-corruption layer del BFF). El backend NestJS gobierna el
 * inventario (stock, movimientos, mermas, alertas, OC). Aquí se traduce backend ⇄
 * frontend para que las pantallas Vue no cambien su contrato
 * (`shared/types/domain.ts`). Dinero/cantidades llegan como string del backend.
 */

interface Envelope<T> {
  success: boolean;
  data: T;
}

// ---- Formas del backend (inventory.service.ts) ----
export interface BeStockView {
  ingredientId: string;
  name: string;
  unit: string;
  unitCost: string;
  stock: string;
  minStock: string;
  status: StockStatus;
}

export interface BeMovementView {
  id: string;
  ingredientId: string;
  ingredientName: string;
  type: MovementType;
  qty: string;
  unit: string;
  note: string | null;
  reason: string | null;
  userId: string | null;
  createdAt: string;
}

export interface BeAlertView {
  ingredientId: string;
  name: string;
  unit: string;
  stock: string;
  minStock: string;
  deficit: string;
  status: StockStatus;
}

export interface BeWasteHistory {
  items: BeMovementView[];
  totalWasteCost: string;
}

const num = (s: string | null | undefined): number =>
  s == null ? 0 : Number(s);

// ---- Stock por insumo ----
export async function listStockLevels(event: H3Event): Promise<BeStockView[]> {
  const res = await backendFetch<Envelope<BeStockView[]>>(
    event,
    "/api/inventory/stock",
  );
  return res.data;
}

/** Mapa ingredientId → stock real (para fusionar con el catálogo de E02). */
export async function stockMap(
  event: H3Event,
): Promise<Map<string, BeStockView>> {
  const rows = await listStockLevels(event);
  return new Map(rows.map((r) => [r.ingredientId, r]));
}

// ---- Movimientos (kardex) ----
/** Backend MovementView → InventoryMovement del frontend (date=createdAt, user=userId). */
export function toFrontendMovement(m: BeMovementView): InventoryMovement {
  return {
    id: m.id,
    ingredientId: m.ingredientId,
    ingredientName: m.ingredientName,
    type: m.type,
    qty: num(m.qty),
    unit: m.unit,
    date: m.createdAt,
    // El frontend muestra `note`; conservamos la razón de la merma como prefijo
    // si vino sola (el backend la separa en `reason`).
    note: m.note ?? (m.reason ? `Merma: ${m.reason}` : undefined),
    user: m.userId ?? undefined,
  };
}

export async function listMovements(
  event: H3Event,
  ingredientId?: string,
): Promise<InventoryMovement[]> {
  const res = await backendFetch<Envelope<BeMovementView[]>>(
    event,
    "/api/inventory/movements",
    {
      query: ingredientId ? { ingredientId } : undefined,
    },
  );
  return res.data.map(toFrontendMovement);
}

export interface CreateMovementBody {
  ingredientId: string;
  type: MovementType;
  qty: number;
  note?: string;
  reason?: string;
}

export async function createMovement(
  event: H3Event,
  body: CreateMovementBody,
): Promise<InventoryMovement> {
  const res = await backendFetch<Envelope<BeMovementView>>(
    event,
    "/api/inventory/movements",
    {
      method: "POST",
      body: {
        ingredientId: body.ingredientId,
        type: body.type,
        qty: body.qty,
        ...(body.note ? { note: body.note } : {}),
        ...(body.reason ? { reason: body.reason } : {}),
      },
    },
  );
  return toFrontendMovement(res.data);
}

// ---- Alertas → ítems sugeridos de compra ----
/**
 * El backend no persiste una "lista de compras" (es una conveniencia del frontend).
 * Las alertas de stock bajo se mapean a ítems sugeridos: la cantidad sugerida lleva
 * el stock hasta el doble del mínimo (heurística del mock previo) y el costo se
 * estima con el `unitCost` del catálogo (las alertas no lo traen).
 */
export async function listAlerts(event: H3Event): Promise<BeAlertView[]> {
  const res = await backendFetch<Envelope<BeAlertView[]>>(
    event,
    "/api/inventory/alerts",
  );
  return res.data;
}

export async function alertsAsShopping(
  event: H3Event,
): Promise<ShoppingItem[]> {
  const [alerts, stock] = await Promise.all([
    listAlerts(event),
    stockMap(event),
  ]);
  return alerts.map((a) => {
    const min = num(a.minStock);
    const cur = num(a.stock);
    const unitCost = num(stock.get(a.ingredientId)?.unitCost);
    // Reponer hasta el doble del mínimo (mín. 1) — misma heurística del mock.
    const suggestedQty = Math.max(1, +(min * 2 - cur).toFixed(2));
    return {
      id: a.ingredientId, // sin persistencia: el id del insumo identifica el ítem
      ingredientId: a.ingredientId,
      name: a.name,
      suggestedQty,
      unit: a.unit,
      estimatedCost: +(suggestedQty * unitCost).toFixed(2),
      reason:
        a.status === "critical" ? "Stock crítico" : "Stock bajo el mínimo",
      urgent: a.status === "critical",
      checked: false,
    };
  });
}

// ---- Mermas (histórico) ----
export interface WasteHistory {
  items: InventoryMovement[];
  totalWasteCost: number;
}

export async function listWaste(event: H3Event): Promise<WasteHistory> {
  const res = await backendFetch<Envelope<BeWasteHistory>>(
    event,
    "/api/inventory/waste",
  );
  return {
    items: res.data.items.map(toFrontendMovement),
    totalWasteCost: num(res.data.totalWasteCost),
  };
}

// ---- Cobertura de stock por insumo (Widget B) ----

/** Backend shape for GET /api/inventory/ingredients/:id/coverage (decimal strings). */
interface BeIngredientCoverage {
  ingredientId: string;
  currentStock: string;
  avgDailyConsumption: string;
  basedOnDays: number;
  daysLeft: string | null;
}

/**
 * Returns real stock coverage for a specific ingredient from
 * `GET /api/inventory/ingredients/:id/coverage`.
 * `daysLeft` is null when `avgDailyConsumption === 0` (no recent movements);
 * callers must surface this explicitly rather than defaulting to a hardcoded value.
 */
export async function ingredientCoverage(
  event: H3Event,
  id: string,
): Promise<IngredientCoverageView> {
  const res = await backendFetch<Envelope<BeIngredientCoverage>>(
    event,
    `/api/inventory/ingredients/${id}/coverage`,
  );
  const d = res.data;
  return {
    ingredientId: d.ingredientId,
    currentStock: num(d.currentStock),
    avgDailyConsumption: num(d.avgDailyConsumption),
    basedOnDays: d.basedOnDays,
    daysLeft: d.daysLeft != null ? num(d.daysLeft) : null,
  };
}

// ---- Historial de precios por insumo (Widget C) ----

/** Backend shape for GET /api/inventory/ingredients/:id/price-trend (decimal strings). */
interface BePriceTrendPoint {
  recordedAt: string;
  unitCost: string;
  source: "purchase_order" | "manual";
}

/**
 * Returns price-trend history for a specific ingredient from
 * `GET /api/inventory/ingredients/:id/price-trend?limit=N`.
 * The backend returns points newest-first; callers that need chronological order
 * should reverse the array. Fewer than 2 points means no % change is computable.
 *
 * @param limit Maximum number of data points (default 12).
 */
export async function ingredientPriceTrend(
  event: H3Event,
  id: string,
  limit = 12,
): Promise<PriceTrendPoint[]> {
  const res = await backendFetch<Envelope<BePriceTrendPoint[]>>(
    event,
    `/api/inventory/ingredients/${id}/price-trend`,
    { query: { limit } },
  );
  return res.data.map((p) => ({
    recordedAt: p.recordedAt,
    unitCost: num(p.unitCost),
    source: p.source,
  }));
}

// ---- Mínimos de reorden ----
export async function updateLevel(
  event: H3Event,
  ingredientId: string,
  minStock: number,
): Promise<BeStockView> {
  const res = await backendFetch<Envelope<BeStockView>>(
    event,
    `/api/inventory/levels/${ingredientId}`,
    { method: "PATCH", body: { minStock } },
  );
  return res.data;
}
