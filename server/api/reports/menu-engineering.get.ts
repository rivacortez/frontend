import { backendFetch } from "../../utils/backend";

interface Envelope<T> {
  success: boolean;
  data: T;
}

type Money = string;

/** Classification of a menu item in the 2×2 Boston matrix. */
export type MenuItemClassification = "star" | "plowhorse" | "puzzle" | "dog";

/** Strategic recommendation derived from classification. */
export type MenuItemRecommendation =
  | "promote"
  | "reprice_or_reduce_portion"
  | "reposition_or_rename"
  | "remove_or_rework";

/**
 * Single item row returned by the menu-engineering endpoint.
 * Money AND ratio fields (price, foodCost, contributionMargin,
 * totalContribution, popularityShare) are Prisma `Decimal` columns and arrive
 * as decimal strings (e.g. `"0.0437"`), never `number` — `unitsSold` is the
 * only genuine integer here. The frontend converts with `toNumber`/`num()`
 * before formatting or arithmetic (never call `.toFixed()` directly on these).
 */
export interface MenuEngineeringItemView {
  menuItemId: string;
  name: string;
  category?: string;
  unitsSold: number;
  price: Money;
  foodCost: Money;
  contributionMargin: Money;
  totalContribution: Money;
  popularityShare: Money;
  classification: MenuItemClassification;
  recommendation: MenuItemRecommendation;
}

/**
 * Full payload of GET /api/reports/menu-engineering.
 * `popularityCutoff` and `avgContributionMargin` are the cross-hair values that
 * divide the 2×2 matrix (mean popularity % and mean contribution margin).
 * Both are Prisma `Decimal` → decimal strings, same as `Money`.
 */
export interface MenuEngineeringReportView {
  period: string;
  popularityCutoff: Money;
  avgContributionMargin: Money;
  items: MenuEngineeringItemView[];
}

// E07 · Menu Engineering · Proxy autenticado → backend GET /api/reports/menu-engineering.
// Requiere `period=YYYY-MM`. Leer Report → owner/manager; staff → 403.
export default defineEventHandler(async (event) => {
  const { period } = getQuery(event);
  if (!period) {
    throw createError({
      statusCode: 400,
      statusMessage: "Falta el período (YYYY-MM)",
    });
  }
  const res = await backendFetch<Envelope<MenuEngineeringReportView>>(
    event,
    "/api/reports/menu-engineering",
    { query: { period } },
  );
  return ok(res.data);
});
