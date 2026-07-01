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
 * Money fields (price, foodCost, contributionMargin, totalContribution) are
 * decimal strings (PEN); the frontend converts them to number only for display.
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
  popularityShare: number;
  classification: MenuItemClassification;
  recommendation: MenuItemRecommendation;
}

/**
 * Full payload of GET /api/reports/menu-engineering.
 * `popularityCutoff` and `avgContributionMargin` are the cross-hair values that
 * divide the 2×2 matrix (mean popularity % and mean contribution margin).
 */
export interface MenuEngineeringReportView {
  period: string;
  popularityCutoff: number;
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
