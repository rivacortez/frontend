import { backendFetch } from "../../utils/backend";

interface Envelope<T> {
  success: boolean;
  data: T;
}

// E04 · Resumen de ventas del día calendario (zona Lima). `total` llega como
// string Decimal; el frontend lo convierte con toNumber. Solo cuenta el día de
// hoy, sin el histórico (a diferencia de GET /api/sales, que trae todo).
export interface SalesTodaySummaryView {
  date: string;
  total: string;
  count: number;
}

// Proxy autenticado → backend GET /api/sales/today-summary. Thin passthrough.
export default defineEventHandler(async (event) => {
  const res = await backendFetch<Envelope<SalesTodaySummaryView>>(
    event,
    "/api/sales/today-summary",
  );
  return ok(res.data);
});
