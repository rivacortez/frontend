import { forecastShoppingSuggestions } from "../../utils/forecasting-adapter";

// Proxy autenticado → backend GET /api/forecasting/shopping-suggestions?horizon=14.
// Lista de compras basada en el forecast de demanda (E08 / core-ai). Junto con
// `insights.get.ts` (fase 3), es de los pocos widgets donde el label "IA / forecast"
// es legítimo: el backend usa un modelo predictivo real del microservicio core-ai.
// `needsForecast:true` significa que aún no hay un run completado — el cliente
// muestra un estado vacío explicativo.
export default defineEventHandler(async (event) => {
  const data = await forecastShoppingSuggestions(event);
  return ok(data);
});
