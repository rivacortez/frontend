/** Formato de moneda local: S/ 1,234.50 (TP1 es solo PEN). */
export function formatPEN(value: number): string {
  return `S/ ${value.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Formatea una cantidad discreta con su unidad de negocio, p. ej. `"118
 * platos"` (QA-23 — la serie del forecast del chat está en unidades, no en
 * soles; ver `ChatForecastMeta.unitLabel`). Redondea porque el valor es una
 * proyección del modelo, no una medición exacta con decimales significativos.
 *
 * @param value - Cantidad proyectada (unidades).
 * @param unitLabel - Etiqueta declarada por el backend (p. ej. "platos").
 *   Cuando falta (respuesta legacy sin este campo), se omite para no inventar
 *   una unidad ni, peor, dar a entender que el número es dinero.
 */
export function formatUnits(value: number, unitLabel?: string): string {
  const n = Math.round(value).toLocaleString("es-PE");
  return unitLabel ? `${n} ${unitLabel}` : n;
}

/**
 * Coerción segura de un valor numérico del backend a `number`.
 *
 * POR QUÉ: los campos `Decimal` de Prisma (dinero, porcentajes) llegan del
 * backend NestJS serializados como **string** (p. ej. `"56.06"`) para no
 * perder precisión en tránsito — ver los tipos `Money = string` en
 * `server/api/reports/*.get.ts`. Este helper es el único punto seguro de
 * conversión antes de formatear o hacer aritmética: nunca lanza y nunca deja
 * pasar `NaN` a la UI (bug real: `(n ?? 0).toFixed()` sobre un string
 * reventaba `prime-cost.vue` porque `n ?? 0` no protege contra el tipo).
 *
 * @param value - Valor crudo del BFF: string decimal, number, o
 *   `null`/`undefined` (campo ausente).
 * @returns Un número finito, o `0` si `value` falta o no es numérico.
 */
export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Formatea un porcentaje (string decimal o number) como `"56.06%"`.
 * Tolera string/null/undefined/NaN vía {@link toNumber} — nunca revienta el
 * render aunque el campo llegue con un tipo inesperado.
 */
export function formatPercent(
  value: string | number | null | undefined,
  decimals = 2,
): string {
  return `${toNumber(value).toFixed(decimals)}%`;
}

/** Hora local corta: 19:45 */
export function formatTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Lima",
  });
}

/** Fecha local corta: 10 jun */
export function formatShortDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    timeZone: "America/Lima",
  });
}

/**
 * Días restantes (redondeados hacia arriba) hasta una fecha ISO; negativo si
 * ya pasó. Uso exclusivamente de PRESENTACIÓN (p. ej. "Por vencer · N días" en
 * el widget de vida útil, F3) — el backend es la única fuente de verdad para
 * el estado de frescura (`freshnessStatus`); este helper solo formatea una
 * fecha que el backend ya calculó (`estimatedExpiryAt`), nunca decide el
 * estado por su cuenta.
 */
export function daysUntil(isoDate: string, now: number = Date.now()): number {
  return Math.ceil((new Date(isoDate).getTime() - now) / 86_400_000);
}

/** Tiempo relativo: "hace 4 min", "hace 2 h", "ayer" */
export function timeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}

/** Minutos transcurridos desde una fecha: "1 h 25 min" */
export function elapsed(isoDate: string): string {
  const mins = Math.max(
    0,
    Math.round((Date.now() - new Date(isoDate).getTime()) / 60_000),
  );
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h} h ${mins % 60} min`;
}

/**
 * Mensaje legible de un error de `$fetch`. El BFF propaga el mensaje del backend
 * en `statusMessage`/`data.message` (p. ej. el 409 de borrar-con-hijos); si no
 * hay mensaje útil se usa el `fallback`.
 */
export function errorMessage(error: unknown, fallback: string): string {
  const e = error as {
    statusMessage?: string;
    data?: { message?: string; statusMessage?: string };
  };
  const msg = e?.data?.message ?? e?.data?.statusMessage ?? e?.statusMessage;
  return msg && msg !== "Error del backend" ? msg : fallback;
}
