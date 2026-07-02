import { forecastInsights } from "../../utils/forecasting-adapter";

// Proxy autenticado → backend GET /api/forecasting/insights. Resumen narrable
// del forecast (E08 / HU-08-07 fase 3) para el panel "Lo que se viene" del
// dashboard. Info de gestión → `read Report` en el backend (owner/manager;
// staff → 403, la pantalla lo gatea antes de llamar este endpoint).
export default defineEventHandler(async (event) => {
  const data = await forecastInsights(event);
  return ok(data);
});
