import { forecastShoppingSuggestions } from "../../utils/forecasting-adapter";

// Proxy autenticado → backend GET /api/forecasting/shopping-suggestions?horizon=.
// Lista de compras basada en el forecast de demanda (E08 / core-ai). Junto con
// `insights.get.ts` (fase 3), es de los pocos widgets donde el label "IA / forecast"
// es legítimo: el backend usa un modelo predictivo real del microservicio core-ai.
// `needsForecast:true` significa que aún no hay un run completado — el cliente
// muestra un estado vacío explicativo.
//
// `?horizon=` es opcional (default 14 en el adapter, igual que antes de F2a):
// se reenvía para que la vista "S/ en riesgo esta semana" pueda pedir una
// ventana de 7 días — distinta de la ventana de la lista de compras (14 días
// por defecto) — sin duplicar este endpoint.
export default defineEventHandler(async (event) => {
  const { horizon } = getQuery(event);
  const parsed = Number(horizon);
  const parsedHorizon =
    Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  const data = await forecastShoppingSuggestions(event, parsedHorizon);
  return ok(data);
});
