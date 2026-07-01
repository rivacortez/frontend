import { backendFetch } from "../../utils/backend";

interface SalesHistoryRow {
  soldOn: string;
  dishName: string;
  menuItemId: string | null;
  qty: number;
  unitPrice: string;
  total: string;
}

interface SalesHistoryResponse {
  from: string;
  to: string;
  totalQty: number;
  totalRevenue: string;
  rows: SalesHistoryRow[];
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

/**
 * E11 · HU-11-01 — Proxy autenticado para `GET /api/sales-history` del backend.
 *
 * Acepta los query params `from` y `to` (ISO date strings) y los reenvía tal cual.
 * Sin filtros → el backend devuelve todo el histórico (comportamiento por defecto,
 * que usa la tarjeta "Estado actual" en la página de importación).
 *
 * Respuesta: `{ from, to, totalQty, totalRevenue, rows[] }` donde `from`/`to` reflejan
 * los límites reales del conjunto devuelto (no el filtro solicitado).
 *
 * RBAC: `manage Report` (owner/manager; staff → 403 propagado).
 */
export default defineEventHandler(async (event) => {
  const rawQuery = getQuery(event);

  // Build a clean query object: only include from/to when the caller provided them.
  const q: Record<string, string> = {};
  if (typeof rawQuery.from === "string" && rawQuery.from)
    q.from = rawQuery.from;
  if (typeof rawQuery.to === "string" && rawQuery.to) q.to = rawQuery.to;

  const res = await backendFetch<Envelope<SalesHistoryResponse>>(
    event,
    "/api/sales-history",
    { query: q },
  );

  return ok(res.data);
});
