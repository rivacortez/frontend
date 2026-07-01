import type { ApiResponse } from "#shared/types/api";
import type { CashierDashboardView } from "~~/server/api/reports/dashboard/cashier.get";
import type { ManagerDashboardView } from "~~/server/api/reports/dashboard/manager.get";
import type { AdminDashboardView } from "~~/server/api/reports/dashboard/admin.get";
import type { SalesReportView } from "~~/server/api/reports/sales.get";
import type { ParetoReportView } from "~~/server/api/reports/pareto-dishes.get";
import type { InventoryReportView } from "~~/server/api/reports/inventory.get";
import type { FoodCostReportView } from "~~/server/api/reports/food-cost.get";
import type { WasteReportView } from "~~/server/api/reports/waste.get";
import type { MenuEngineeringReportView } from "~~/server/api/reports/menu-engineering.get";
import type { PrimeCostReportView } from "~~/server/api/reports/prime-cost.get";

// E07 · Reportes y dashboards (read-only). El backend devuelve toda la moneda como
// string (PEN, precisión Decimal); las pantallas la convierten a number solo para
// formatear con `formatPEN`. La mayoría es info de gestión (CASL Report): owner/
// manager (staff → 403); el dashboard del cajero es operativo (read Sale → staff lo ve).
// Los reads aceptan un getter `enabled` para gatear por rol (igual que use-costing).

export type {
  CashierDashboardView,
  ManagerDashboardView,
  AdminDashboardView,
  SalesReportView,
  ParetoReportView,
  InventoryReportView,
  FoodCostReportView,
  WasteReportView,
  MenuEngineeringReportView,
  PrimeCostReportView,
};

export type SalesGroupBy = "day" | "method" | "docType";

// Ventana de fechas que el cliente arma para los reportes. `from`/`to` son ISO 8601
// con offset de Lima (UTC-5 fijo); el backend valida `from <= to`.
export interface DateWindow {
  from: string;
  to: string;
}

const LIMA_OFFSET = "-05:00";

/** Clave de día local (Lima) `YYYY-MM-DD` para una fecha (por defecto, hoy). */
export function limaDayKey(at: Date = new Date()): string {
  // en-CA da YYYY-MM-DD; con timeZone Lima obtenemos el día local correcto.
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Lima",
  }).format(at);
}

/** Instante ISO del inicio (00:00:00) del día local Lima `YYYY-MM-DD`. */
export function limaDayStartIso(dayKey: string): string {
  return `${dayKey}T00:00:00${LIMA_OFFSET}`;
}

/** Instante ISO del fin (23:59:59) del día local Lima `YYYY-MM-DD`. */
export function limaDayEndIso(dayKey: string): string {
  return `${dayKey}T23:59:59${LIMA_OFFSET}`;
}

/** Ventana de un solo día local (Lima). */
export function dayWindow(dayKey: string): DateWindow {
  return { from: limaDayStartIso(dayKey), to: limaDayEndIso(dayKey) };
}

/** Ventana [desde, hasta] (claves de día local Lima, ambas inclusivas). */
export function rangeWindow(fromDay: string, toDay: string): DateWindow {
  return { from: limaDayStartIso(fromDay), to: limaDayEndIso(toDay) };
}

/** Suma `days` días a una clave `YYYY-MM-DD` (interpretada como mediodía UTC para evitar saltos de DST). */
function addDays(dayKey: string, days: number): string {
  const d = new Date(`${dayKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Presets de rango para el selector: hoy, esta semana (lun–hoy), este mes (1–hoy). */
export function presetWindow(preset: "hoy" | "semana" | "mes"): DateWindow {
  const today = limaDayKey();
  if (preset === "hoy") return dayWindow(today);
  if (preset === "mes") {
    const first = `${today.slice(0, 7)}-01`;
    return rangeWindow(first, today);
  }
  // semana: desde el lunes de la semana local actual hasta hoy.
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0=dom..6=sáb
  const backToMonday = (weekday + 6) % 7;
  return rangeWindow(addDays(today, -backToMonday), today);
}

/** Período `YYYY-MM` del mes actual en Lima (para food cost). */
export function currentPeriod(): string {
  return limaDayKey().slice(0, 7);
}

/**
 * Período `YYYY-MM` del último mes completo en Lima.
 * Usado como default en los análisis de ingeniería de menú y prime cost, que
 * requieren un mes cerrado para que todos los datos estén disponibles.
 */
export function lastCompletePeriod(): string {
  const today = limaDayKey(); // "YYYY-MM-DD"
  const year = parseInt(today.slice(0, 4), 10);
  const month = parseInt(today.slice(5, 7), 10);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
}

function enabledGetter(enabled?: MaybeRefOrGetter<boolean>) {
  return () => (enabled ? toValue(enabled) : true);
}

// ===== Dashboards =====

/** HU-07-03 · Dashboard del cajero (caja del día). Operativo → visible a staff. */
export function useCashierDashboard(enabled?: MaybeRefOrGetter<boolean>) {
  return useQuery({
    key: () => ["reports", "dashboard", "cashier"] as const,
    enabled: enabledGetter(enabled),
    query: () =>
      $fetch<ApiResponse<CashierDashboardView>>(
        "/api/reports/dashboard/cashier",
      ).then((r) => r.data),
  });
}

/** HU-07-02 · Dashboard del gerente (operativo, foco en hoy). owner/manager. */
export function useManagerDashboard(enabled?: MaybeRefOrGetter<boolean>) {
  return useQuery({
    key: () => ["reports", "dashboard", "manager"] as const,
    enabled: enabledGetter(enabled),
    query: () =>
      $fetch<ApiResponse<ManagerDashboardView>>(
        "/api/reports/dashboard/manager",
      ).then((r) => r.data),
  });
}

/** HU-07-01 · Dashboard del admin (ejecutivo, KPIs financieros). owner/manager. */
export function useAdminDashboard(enabled?: MaybeRefOrGetter<boolean>) {
  return useQuery({
    key: () => ["reports", "dashboard", "admin"] as const,
    enabled: enabledGetter(enabled),
    query: () =>
      $fetch<ApiResponse<AdminDashboardView>>(
        "/api/reports/dashboard/admin",
      ).then((r) => r.data),
  });
}

// ===== Reportes (ventana + groupBy/period) =====

/** HU-07-04 · Reporte de ventas en una ventana, agrupado por day|method|docType. */
export function useSalesReport(
  window: MaybeRefOrGetter<DateWindow>,
  groupBy: MaybeRefOrGetter<SalesGroupBy>,
  enabled?: MaybeRefOrGetter<boolean>,
) {
  return useQuery({
    key: () => {
      const w = toValue(window);
      return ["reports", "sales", w.from, w.to, toValue(groupBy)] as const;
    },
    enabled: enabledGetter(enabled),
    query: () => {
      const w = toValue(window);
      return $fetch<ApiResponse<SalesReportView>>("/api/reports/sales", {
        query: { from: w.from, to: w.to, groupBy: toValue(groupBy) },
      }).then((r) => r.data);
    },
  });
}

/** HU-07-08 · Análisis Pareto/ABC de platos por revenue en la ventana. */
export function useParetoDishes(
  window: MaybeRefOrGetter<DateWindow>,
  enabled?: MaybeRefOrGetter<boolean>,
) {
  return useQuery({
    key: () => {
      const w = toValue(window);
      return ["reports", "pareto", w.from, w.to] as const;
    },
    enabled: enabledGetter(enabled),
    query: () => {
      const w = toValue(window);
      return $fetch<ApiResponse<ParetoReportView>>(
        "/api/reports/pareto-dishes",
        {
          query: { from: w.from, to: w.to },
        },
      ).then((r) => r.data);
    },
  });
}

/** HU-07-05 · Reporte de inventario: valoración del stock actual (sin ventana). */
export function useInventoryReport(enabled?: MaybeRefOrGetter<boolean>) {
  return useQuery({
    key: () => ["reports", "inventory"] as const,
    enabled: enabledGetter(enabled),
    query: () =>
      $fetch<ApiResponse<InventoryReportView>>("/api/reports/inventory").then(
        (r) => r.data,
      ),
  });
}

/** HU-07-06 · Reporte de food cost del período `YYYY-MM` (food cost % por plato). */
export function useFoodCostReport(
  period: MaybeRefOrGetter<string>,
  enabled?: MaybeRefOrGetter<boolean>,
) {
  return useQuery({
    key: () => ["reports", "food-cost", toValue(period)] as const,
    enabled: enabledGetter(enabled),
    query: () =>
      $fetch<ApiResponse<FoodCostReportView>>("/api/reports/food-cost", {
        query: { period: toValue(period) },
      }).then((r) => r.data),
  });
}

/** HU-07-07 · Reporte de mermas en la ventana (por insumo / por razón + detalle). */
export function useWasteReport(
  window: MaybeRefOrGetter<DateWindow>,
  enabled?: MaybeRefOrGetter<boolean>,
) {
  return useQuery({
    key: () => {
      const w = toValue(window);
      return ["reports", "waste", w.from, w.to] as const;
    },
    enabled: enabledGetter(enabled),
    query: () => {
      const w = toValue(window);
      return $fetch<ApiResponse<WasteReportView>>("/api/reports/waste", {
        query: { from: w.from, to: w.to },
      }).then((r) => r.data);
    },
  });
}

// ===== Análisis avanzados (ingeniería de menú + prime cost) =====

/**
 * E07 · Ingeniería de menú (2×2 Boston matrix).
 * Devuelve la clasificación star/plowhorse/puzzle/dog de cada plato para el
 * período `YYYY-MM` dado. Solo disponible a owner/manager (backend 403 a staff).
 * El análisis requiere recetas con costos registrados y ventas en el período.
 */
export function useMenuEngineering(
  period: MaybeRefOrGetter<string>,
  enabled?: MaybeRefOrGetter<boolean>,
) {
  return useQuery({
    key: () => ["reports", "menu-engineering", toValue(period)] as const,
    enabled: enabledGetter(enabled),
    query: () =>
      $fetch<ApiResponse<MenuEngineeringReportView>>(
        "/api/reports/menu-engineering",
        { query: { period: toValue(period) } },
      ).then((r) => r.data),
  });
}

/**
 * E07 · Prime cost del período `YYYY-MM`.
 * Retorna food cost % + labor cost % + prime cost % con su estado
 * (good/warning/high) y los benchmarks del sector. Owner/manager only.
 */
export function usePrimeCost(
  period: MaybeRefOrGetter<string>,
  enabled?: MaybeRefOrGetter<boolean>,
) {
  return useQuery({
    key: () => ["reports", "prime-cost", toValue(period)] as const,
    enabled: enabledGetter(enabled),
    query: () =>
      $fetch<ApiResponse<PrimeCostReportView>>("/api/reports/prime-cost", {
        query: { period: toValue(period) },
      }).then((r) => r.data),
  });
}

// ===== Exportación CSV (HU-07-10) =====

/**
 * Descarga un reporte como CSV (`?format=csv`) vía el BFF y dispara la descarga en
 * el navegador. El BFF reenvía el `text/csv` del backend con su `Content-Disposition`;
 * aquí leemos el cuerpo como Blob y forzamos el guardado con un nombre local. Solo
 * disponible en cliente (usa `document`/`URL`). El RBAC del backend aplica (staff → 403).
 */
export function useReportCsv() {
  return async (
    report: "sales" | "inventory" | "food-cost" | "waste",
    query: Record<string, string> = {},
  ): Promise<void> => {
    if (!import.meta.client) return;
    const blob = await $fetch<Blob>(`/api/reports/${report}`, {
      query: { ...query, format: "csv" },
      responseType: "blob",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report}-${limaDayKey()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
}
