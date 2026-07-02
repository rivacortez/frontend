import type { H3Event } from "h3";
import type {
  DiningTable,
  Order,
  OrderItem,
  OrderSuggestionView,
  PaymentMethod,
  Sale,
  SaleDocType,
  SaleStatus,
  TableStatus,
} from "#shared/types/domain";
import { backendFetch } from "./backend";

/**
 * Adaptador E03 (anti-corruption layer del BFF) para POS / salón. El backend
 * NestJS expone `TableView` y `OrderView` (con precios string, `menuItemId`, y
 * estados `sent_to_kitchen`/`ready`); aquí se traduce backend ⇄ frontend para
 * que las pantallas Vue no cambien su contrato (`shared/types/domain.ts`).
 *
 * Mapas clave:
 *  - recipeId ⇄ menuItemId vía `/api/menu/items` (el frontend trabaja con la
 *    "receta = plato vendible"; el backend toma órdenes por `menuItemId`).
 *  - descuento (discount) aún no existe en el backend → se ignora.
 *
 * E04 (cobros) — ya integrado: `pay` (POST /api/orders/:id/pay → {order, sale}),
 * `listSales`/`getSale`/`voidSale` (GET/POST /api/sales), y los passthrough de
 * `preBill` (GET /api/orders/:id/pre-bill) y `splitOrder` (POST /api/orders/:id/split).
 * El backend devuelve `SaleView` con moneda string → `toFrontendSale` la traduce
 * al `Sale` del frontend (números).
 */

interface Envelope<T> {
  success: boolean;
  data: T;
}

// ---- Formas del backend ----
interface BeTableView {
  id: string;
  zoneId: string;
  zoneName: string;
  code: string;
  capacity: number;
  status: string;
  posX: number | null;
  posY: number | null;
  currentOrderId: string | null;
  openedAt: string | null;
  guests: number | null;
  waiterId: string | null;
  waiterName: string | null;
}
interface BeOrderItemView {
  id: string;
  menuItemId: string;
  name: string;
  qty: number;
  unitPrice: string;
  notes: string | null;
  modifiers: { name: string; priceDelta: number }[];
  status: string;
}
// Descuento capturado en la orden (E04): value string (Decimal). El monto en
// soles resuelto (`amount`) solo lo devuelven las vistas calculadas.
interface BeOrderDiscount {
  type: "pct" | "amount";
  value: string;
  reason: string | null;
}
// Descuento en las vistas calculadas (pre-bill/split/sale): incluye `amount`.
interface BeViewDiscount extends BeOrderDiscount {
  amount: string;
}
interface BeOrderView {
  id: string;
  tableId: string;
  waiterId: string | null;
  guests: number;
  status: string;
  openedAt: string;
  items: BeOrderItemView[];
  subtotal: string;
  discount?: BeOrderDiscount | null;
}
interface BeMenuItem {
  id: string;
  name: string;
  recipeId: string;
  price: string;
}
interface BeTableDetail {
  table: BeTableView;
  order: BeOrderView | null;
}

// ---- Formas E04 (billing) del backend ----
interface BeSaleItemView {
  name: string;
  qty: number;
  unitPrice: string;
  total: string;
}
interface BeSaleView {
  id: string;
  orderId: string;
  serie: string;
  number: number;
  docType: string;
  customer: string | null;
  customerDoc: string | null;
  date: string;
  tableLabel: string;
  items: BeSaleItemView[];
  grossTotal?: string;
  discount?: BeViewDiscount | null;
  subtotal: string;
  igv: string;
  total: string;
  method: string;
  payments: { method: string; amount: string }[];
  status: string;
}
interface BePreBillItem {
  name: string;
  qty: number;
  unitPrice: string;
  lineTotal: string;
}
export interface BePreBillView {
  orderId: string;
  tableCode: string;
  items: BePreBillItem[];
  grossTotal: string;
  discount: BeViewDiscount | null;
  subtotal: string;
  igv: string;
  total: string;
}
export interface BeSplitShare {
  label: string;
  subtotal: string;
  igv: string;
  total: string;
}
export interface BeSplitView {
  orderId: string;
  mode: "equal" | "items";
  grossTotal: string;
  discount: BeViewDiscount | null;
  shares: BeSplitShare[];
  total: string;
}

const num = (s: string | null | undefined): number =>
  s == null ? 0 : Number(s);

// El backend valida estados de mesa con el mismo enum que el frontend; el cast
// es seguro (free|occupied|bill|reserved). Cualquier valor inesperado → 'free'.
const TABLE_STATUSES: TableStatus[] = ["free", "occupied", "bill", "reserved"];
function toTableStatus(s: string): TableStatus {
  return (TABLE_STATUSES as string[]).includes(s) ? (s as TableStatus) : "free";
}

// ---- Mapas de menú (recipeId ⇄ menuItemId) ----
interface MenuMaps {
  itemByRecipe: Map<string, BeMenuItem>; // recipeId → menuItem
  recipeByItem: Map<string, string>; // menuItemId → recipeId
}
async function fetchMenuMaps(event: H3Event): Promise<MenuMaps> {
  const items = await backendFetch<Envelope<BeMenuItem[]>>(
    event,
    "/api/menu/items",
  );
  const itemByRecipe = new Map<string, BeMenuItem>();
  const recipeByItem = new Map<string, string>();
  for (const it of items.data) {
    itemByRecipe.set(it.recipeId, it);
    recipeByItem.set(it.id, it.recipeId);
  }
  return { itemByRecipe, recipeByItem };
}

// ---- Mesa → DiningTable ----
function toDiningTable(t: BeTableView, index: number): DiningTable {
  // number = parseInt(code) si es numérico; si no, índice+1 (estable por orden de code).
  const parsed = Number.parseInt(t.code, 10);
  const number = Number.isNaN(parsed) ? index + 1 : parsed;
  return {
    id: t.id,
    number,
    zone: t.zoneName,
    seats: t.capacity,
    status: toTableStatus(t.status),
    openedAt: t.openedAt ?? undefined,
    orderId: t.currentOrderId ?? undefined,
    // `TableView` del backend ya resuelve el nombre del mesero (join a users) en
    // `waiterName` (null si la mesa está libre / sin mesero). El frontend solo
    // necesita el nombre para el mapa/mesa → `waiterId` (uuid) no se surfacea.
    waiter: t.waiterName ?? undefined,
    guests: t.guests ?? undefined,
  };
}

// ---- OrderView → Order ----
function toOrderStatus(s: string): Order["status"] {
  if (s === "void") return "void";
  if (s === "paid") return "paid";
  // open | sent_to_kitchen | served → 'open' (el frontend solo distingue open/paid/void).
  return "open";
}

function toOrderItemStatus(s: string): OrderItem["status"] {
  // El backend tiene 'ready' (listo en cocina) que el frontend no modela → 'preparing'.
  if (s === "ready") return "preparing";
  if (s === "preparing") return "preparing";
  if (s === "served") return "served";
  return "pending";
}

function toOrderItem(
  it: BeOrderItemView,
  recipeByItem: Map<string, string>,
): OrderItem {
  return {
    id: it.id,
    // recipeId: reverse-lookup menuItemId → recipeId (fallback al menuItemId).
    recipeId: recipeByItem.get(it.menuItemId) ?? it.menuItemId,
    name: it.name,
    qty: it.qty,
    unitPrice: num(it.unitPrice),
    notes: it.notes ?? undefined,
    status: toOrderItemStatus(it.status),
  };
}

function toOrder(o: BeOrderView, recipeByItem: Map<string, string>): Order {
  return {
    id: o.id,
    tableId: o.tableId,
    openedAt: o.openedAt,
    items: o.items.map((it) => toOrderItem(it, recipeByItem)),
    // E04 (billing): el descuento ya existe en el backend (POST/DELETE
    // /orders/:id/discount). value llega como string Decimal → number.
    discount: o.discount
      ? {
          type: o.discount.type,
          value: num(o.discount.value),
          reason: o.discount.reason ?? undefined,
        }
      : undefined,
    // Los pagos se materializan al cobrar (Sale); la orden abierta no los expone.
    payments: [],
    status: toOrderStatus(o.status),
  };
}

// ---- SaleView → Sale (E04) ----
const PAYMENT_METHODS: PaymentMethod[] = ["cash", "card", "yape", "plin"];
function toPaymentMethod(m: string): PaymentMethod {
  return (PAYMENT_METHODS as string[]).includes(m)
    ? (m as PaymentMethod)
    : "cash";
}
function toSaleDocType(d: string): SaleDocType {
  return d === "factura" ? "factura" : "boleta";
}
function toSaleStatus(s: string): SaleStatus {
  return s === "void" ? "void" : "issued";
}

// El `Sale` del frontend es casi idéntico al `SaleView` del backend; la única
// traducción real es moneda string → number y la coerción de los enums.
export function toFrontendSale(s: BeSaleView): Sale {
  return {
    id: s.id,
    serie: s.serie,
    number: s.number,
    docType: toSaleDocType(s.docType),
    date: s.date,
    // El backend siempre manda tableLabel (string, "" si no hay mesa) → undefined si vacío.
    tableLabel: s.tableLabel || undefined,
    customer: s.customer ?? undefined,
    customerDoc: s.customerDoc ?? undefined,
    items: s.items.map((it) => ({
      name: it.name,
      qty: it.qty,
      unitPrice: num(it.unitPrice),
      total: num(it.total),
    })),
    // Descuento del comprobante (E04): grossTotal + descuento con su amount
    // resuelto. Solo presente cuando la venta llevó descuento.
    grossTotal: s.grossTotal != null ? num(s.grossTotal) : undefined,
    discount: s.discount
      ? {
          type: s.discount.type,
          value: num(s.discount.value),
          reason: s.discount.reason ?? undefined,
          amount: num(s.discount.amount),
        }
      : null,
    subtotal: num(s.subtotal),
    igv: num(s.igv),
    total: num(s.total),
    method: toPaymentMethod(s.method),
    status: toSaleStatus(s.status),
  };
}

// ---- Listado de mesas (GET /api/tables) ----
// Extraído para reutilizar el MISMO listado (y por lo tanto el mismo índice
// estable) desde `getTableDetail`/`patchTable`: el backend expone `code`
// alfanumérico (p. ej. "S1", "T2"), no un número de mesa — `toDiningTable`
// solo puede derivar uno numéricamente estable a partir de la posición de
// esta mesa en el listado completo.
async function fetchTablesRaw(event: H3Event): Promise<BeTableView[]> {
  const res = await backendFetch<Envelope<BeTableView[]>>(event, "/api/tables");
  return res.data;
}

export async function listTables(event: H3Event): Promise<DiningTable[]> {
  const rows = await fetchTablesRaw(event);
  return rows.map((t, i) => toDiningTable(t, i));
}

/**
 * Resuelve el índice de `id` dentro del listado completo de mesas — la MISMA
 * fuente de verdad que usa `listTables()` para derivar `DiningTable.number`.
 *
 * POR QUÉ: bug real (QA-03) — antes, `getTableDetail`/`patchTable` pasaban un
 * índice hardcodeado `0` a `toDiningTable` (comentario original: "no tenemos
 * el índice del listado → caemos a 0"). Como el `code` del backend es
 * alfanumérico ("S1", "T2"...), `Number.parseInt` siempre da `NaN` y CADA
 * mesa individual caía al fallback `index + 1` = **1** — el header de mesa
 * mostraba "Mesa 01" sin importar qué mesa se abriera. Re-consultar el
 * listado aquí garantiza que el número mostrado en el detalle coincida
 * siempre con el que ya se ve en la grilla de mesas del POS.
 *
 * @returns El índice de la mesa en el listado, o `-1` si no aparece (p. ej.
 *   fue borrada entre el fetch del listado y este); el caller decide el
 *   fallback.
 */
function findTableIndex(rows: BeTableView[], id: string): number {
  return rows.findIndex((t) => t.id === id);
}

// ---- Detalle de mesa (GET /api/tables/:id → {table, order}) ----
export async function getTableDetail(
  event: H3Event,
  id: string,
): Promise<{ table: DiningTable; order: Order | null }> {
  const [res, maps, allTables] = await Promise.all([
    backendFetch<Envelope<BeTableDetail>>(event, `/api/tables/${id}`),
    fetchMenuMaps(event),
    fetchTablesRaw(event),
  ]);
  const index = findTableIndex(allTables, id);
  const table = toDiningTable(res.data.table, index === -1 ? 0 : index);
  const order = res.data.order
    ? toOrder(res.data.order, maps.recipeByItem)
    : null;
  return { table, order };
}

// ---- Orden por id (GET /api/orders/:id) ----
export async function getOrder(event: H3Event, id: string): Promise<Order> {
  const [res, maps] = await Promise.all([
    backendFetch<Envelope<BeOrderView>>(event, `/api/orders/${id}`),
    fetchMenuMaps(event),
  ]);
  return toOrder(res.data, maps.recipeByItem);
}

// ---- Abrir mesa: POST /api/orders {tableId, guests} → luego GET /api/tables/:id ----
export async function openTable(
  event: H3Event,
  id: string,
  body: { guests: number; waiter?: string },
): Promise<{ table: DiningTable; order: Order | null }> {
  // El backend abre la mesa creando la orden (el mesero sale del JWT, no del body;
  // `waiter` del frontend se ignora — TODO waiter name).
  await backendFetch<Envelope<BeOrderView>>(event, "/api/orders", {
    method: "POST",
    body: { tableId: id, guests: body.guests },
  });
  // El frontend espera {table, order} fresco tras abrir.
  return getTableDetail(event, id);
}

// ---- Agregar ítems: resolver recipeId → menuItemId, POST /api/orders/:id/items ----
export async function addOrderItems(
  event: H3Event,
  orderId: string,
  items: { recipeId: string; qty: number; notes?: string }[],
): Promise<Order> {
  const maps = await fetchMenuMaps(event);
  const beItems = items.map((line) => {
    const menuItem = maps.itemByRecipe.get(line.recipeId);
    if (!menuItem) {
      throw createError({
        statusCode: 422,
        statusMessage: `La receta ${line.recipeId} no es un plato vendible`,
      });
    }
    return { menuItemId: menuItem.id, qty: line.qty, notes: line.notes };
  });
  const res = await backendFetch<Envelope<BeOrderView>>(
    event,
    `/api/orders/${orderId}/items`,
    {
      method: "POST",
      body: { items: beItems },
    },
  );
  return toOrder(res.data, maps.recipeByItem);
}

export interface OrderItemUpdate {
  id: string;
  qty?: number;
  status?: "pending" | "preparing" | "served";
  unitPrice?: number;
  remove?: boolean;
}

export interface PatchOrderBody {
  itemUpdates?: OrderItemUpdate[];
  status?: "open" | "void";
  voidReason?: string;
}

// ---- Patch de orden: itemUpdates → PATCH items; status:'void' → POST /void ----
export async function patchOrder(
  event: H3Event,
  orderId: string,
  body: PatchOrderBody,
): Promise<Order> {
  // 1) Actualizaciones por ítem → PATCH /api/orders/:id/items/:itemId.
  //    (status 'served' pasa tal cual; el backend acepta pending|preparing|ready|served.)
  for (const upd of body.itemUpdates ?? []) {
    const itemBody: Record<string, unknown> = {};
    if (upd.qty !== undefined) itemBody.qty = upd.qty;
    if (upd.status !== undefined) itemBody.status = upd.status;
    if (upd.remove !== undefined) itemBody.remove = upd.remove;
    // `unitPrice` (ajuste de precio, HU del dueño) no tiene campo en el backend
    // todavía (E04 billing) → se ignora silenciosamente.
    await backendFetch<Envelope<BeOrderView>>(
      event,
      `/api/orders/${orderId}/items/${upd.id}`,
      {
        method: "PATCH",
        body: itemBody,
      },
    );
  }

  // 2) Anular (HU-03-11) → POST /api/orders/:id/void {reason} (reason OBLIGATORIO).
  if (body.status === "void") {
    const reason = body.voidReason?.trim() || "Anulada desde POS";
    await backendFetch<Envelope<BeOrderView>>(
      event,
      `/api/orders/${orderId}/void`,
      {
        method: "POST",
        body: { reason },
      },
    );
  }

  // El descuento NO se maneja aquí: tiene su propio endpoint dedicado
  // (POST/DELETE /api/orders/:id/discount) → ver applyDiscount/removeDiscount.

  // Devuelve la orden fresca ya mapeada.
  return getOrder(event, orderId);
}

// ---- E04 · Descuento (HU-04) — manager/owner (staff → 403) ----
export interface ApplyDiscountBody {
  type: "pct" | "amount";
  value: number;
  reason: string;
}
/**
 * Aplica un descuento a la orden: POST /api/orders/:id/discount.
 * El backend valida rol (manager/owner → staff recibe 403) y monto (400 si un
 * descuento por monto excede el bruto). Devuelve la orden fresca ya mapeada
 * (con `order.discount` poblado), para que la UI refleje el estado real.
 */
export async function applyDiscount(
  event: H3Event,
  orderId: string,
  body: ApplyDiscountBody,
): Promise<Order> {
  const [res, maps] = await Promise.all([
    backendFetch<Envelope<BeOrderView>>(
      event,
      `/api/orders/${orderId}/discount`,
      { method: "POST", body: { ...body } },
    ),
    fetchMenuMaps(event),
  ]);
  return toOrder(res.data, maps.recipeByItem);
}

/** Quita el descuento de la orden: DELETE /api/orders/:id/discount. */
export async function removeDiscount(
  event: H3Event,
  orderId: string,
): Promise<Order> {
  const [res, maps] = await Promise.all([
    backendFetch<Envelope<BeOrderView>>(
      event,
      `/api/orders/${orderId}/discount`,
      { method: "DELETE" },
    ),
    fetchMenuMaps(event),
  ]);
  return toOrder(res.data, maps.recipeByItem);
}

// ---- Pre-cuenta / pedir cuenta: PATCH /api/tables/:id {status} ----
export async function patchTable(
  event: H3Event,
  id: string,
  body: { status?: TableStatus; waiter?: string; guests?: number },
): Promise<DiningTable> {
  // El backend solo acepta `status` (zoneId/code/capacity/posX/posY no aplican
  // al POS). `waiter`/`guests` del frontend no tienen campo de PATCH en mesa →
  // se ignoran; el caso real es pedir cuenta (status:'bill') o liberar ('free').
  if (body.status !== undefined) {
    await backendFetch<Envelope<BeTableView>>(event, `/api/tables/${id}`, {
      method: "PATCH",
      body: { status: body.status },
    });
  }
  const [res, allTables] = await Promise.all([
    backendFetch<Envelope<BeTableView>>(event, `/api/tables/${id}`),
    fetchTablesRaw(event),
  ]);
  const index = findTableIndex(allTables, id);
  return toDiningTable(res.data, index === -1 ? 0 : index);
}

// ---- Enviar a cocina (HU-03-06): POST /api/orders/:id/send-to-kitchen ----
export async function sendOrderToKitchen(
  event: H3Event,
  orderId: string,
): Promise<Order> {
  const [res, maps] = await Promise.all([
    backendFetch<Envelope<BeOrderView>>(
      event,
      `/api/orders/${orderId}/send-to-kitchen`,
      {
        method: "POST",
      },
    ),
    fetchMenuMaps(event),
  ]);
  return toOrder(res.data, maps.recipeByItem);
}

// ---- E04 · Cobrar (HU-04-02/04/05/06): POST /api/orders/:id/pay → {order, sale} ----
export interface PayOrderBody {
  payments: { method: PaymentMethod; amount: number }[];
  docType?: SaleDocType;
  customer?: string;
  customerDoc?: string;
}
export async function payOrder(
  event: H3Event,
  orderId: string,
  body: PayOrderBody,
): Promise<{ order: Order; sale: Sale }> {
  // El total/IGV los calcula el backend desde los ítems vivos; el body solo trae
  // pagos (≥1, monto > 0) + datos del comprobante. 400 si Σpagos < total; 409 si ya pagada.
  const [res, maps] = await Promise.all([
    backendFetch<Envelope<{ order: BeOrderView; sale: BeSaleView }>>(
      event,
      `/api/orders/${orderId}/pay`,
      {
        method: "POST",
        body: { ...body },
      },
    ),
    fetchMenuMaps(event),
  ]);
  return {
    order: toOrder(res.data.order, maps.recipeByItem),
    sale: toFrontendSale(res.data.sale),
  };
}

// ---- E04 · Comprobantes: GET /api/sales (lista) ----
export async function listSales(event: H3Event): Promise<Sale[]> {
  const res = await backendFetch<Envelope<BeSaleView[]>>(event, "/api/sales");
  return res.data.map(toFrontendSale);
}

// ---- E04 · Comprobante por id: GET /api/sales/:id ----
export async function getSale(event: H3Event, id: string): Promise<Sale> {
  const res = await backendFetch<Envelope<BeSaleView>>(
    event,
    `/api/sales/${id}`,
  );
  return toFrontendSale(res.data);
}

// ---- E04 · Anular ticket (HU-04-07): POST /api/sales/:id/void {reason} ----
// El backend exige manager/owner (CASL 'update' 'Sale') → staff recibe 403.
export async function voidSale(
  event: H3Event,
  id: string,
  reason: string,
): Promise<Sale> {
  const res = await backendFetch<Envelope<BeSaleView>>(
    event,
    `/api/sales/${id}/void`,
    {
      method: "POST",
      body: { reason },
    },
  );
  return toFrontendSale(res.data);
}

// ---- E04 · Pre-cuenta (HU-04-01): GET /api/orders/:id/pre-bill ----
// Passthrough de los totales autoritativos del backend (preview, no persiste).
export async function getPreBill(
  event: H3Event,
  orderId: string,
): Promise<BePreBillView> {
  const res = await backendFetch<Envelope<BePreBillView>>(
    event,
    `/api/orders/${orderId}/pre-bill`,
  );
  return res.data;
}

// ---- Widget D · Sugerencias de upsell por orden (HU-03/E03) ----
// Top sellers not already in the order — sales-based recommendation, NOT ML/IA.
// The BFF resolves menuItemId → recipeId so the cart can add items directly.

interface BeOrderSuggestion {
  menuItemId: string;
  name: string;
  price: string;
  timesSold: number;
}

/**
 * Returns up to `limit` sales-based upsell suggestions for an open order.
 * Each suggestion has `recipeId` resolved from the menu maps (anti-corruption layer)
 * so the POS cart can add the item without an extra lookup on the client side.
 *
 * Returns an empty array when the order has no suggestions (already ordered the
 * top sellers, or no sales history exists yet).
 */
export async function orderSuggestions(
  event: H3Event,
  orderId: string,
  limit = 3,
): Promise<OrderSuggestionView[]> {
  const [res, maps] = await Promise.all([
    backendFetch<Envelope<BeOrderSuggestion[]>>(
      event,
      `/api/orders/${orderId}/suggestions`,
      { query: { limit } },
    ),
    fetchMenuMaps(event),
  ]);
  return res.data.map((s) => ({
    menuItemId: s.menuItemId,
    recipeId: maps.recipeByItem.get(s.menuItemId) ?? s.menuItemId,
    name: s.name,
    price: Number(s.price),
    timesSold: s.timesSold,
  }));
}

// ---- E04 · Dividir cuenta (HU-04-03): POST /api/orders/:id/split ----
// Passthrough del cómputo de partes del backend (display, no persiste).
export interface SplitOrderBody {
  mode: "equal" | "items";
  parts?: number;
  assignments?: { label: string; itemIds: string[] }[];
}
export async function splitOrder(
  event: H3Event,
  orderId: string,
  body: SplitOrderBody,
): Promise<BeSplitView> {
  const res = await backendFetch<Envelope<BeSplitView>>(
    event,
    `/api/orders/${orderId}/split`,
    {
      method: "POST",
      body: { ...body },
    },
  );
  return res.data;
}
