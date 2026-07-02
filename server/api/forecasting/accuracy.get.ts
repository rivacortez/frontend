import { forecastAccuracy } from "../../utils/forecasting-adapter";

// Proxy autenticado → backend GET /api/forecasting/accuracy?scope=&menuItemId=.
// HU-08-08 / F2a · "El sistema se autoevalúa": predicho vs. real día a día
// sobre TODAS las corridas completadas del ámbito. Info de gestión → `read
// Report` en el backend (owner/manager; staff → 403, la pantalla lo gatea
// antes de llamar este endpoint, igual que el resto de `/app/reportes`).
// `needsMoreData:true` (200, nunca error) → el cliente muestra un estado
// explicativo en vez de un gráfico casi vacío.
export default defineEventHandler(async (event) => {
  const { scope, menuItemId } = getQuery(event);
  const data = await forecastAccuracy(
    event,
    typeof scope === "string" ? scope : undefined,
    typeof menuItemId === "string" ? menuItemId : undefined,
  );
  return ok(data);
});
