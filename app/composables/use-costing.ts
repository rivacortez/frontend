import type { ApiResponse } from '#shared/types/api'

// E06 · Costeo dinámico y márgenes. El backend devuelve toda la moneda como string
// (PEN, precisión Decimal); las pantallas la convierten a number solo para formatear.
// Todo el costeo es info de gestión (CASL Report): owner/manager; staff recibe 403.

// ===== CIF mensuales (HU-06-02) =====
export interface OverheadCost {
  id: string
  period: string
  concept: string
  amount: string
}

export interface OverheadCostPayload {
  period: string
  concept: string
  amount: number
}

/** Lista de CIF de un período `YYYY-MM` (reactivo: refetch al cambiar el período). */
export function useOverheadCosts(period: MaybeRefOrGetter<string>, enabled?: MaybeRefOrGetter<boolean>) {
  return useQuery({
    key: () => ['overhead-costs', toValue(period)] as const,
    enabled: () => (enabled ? toValue(enabled) : true),
    query: () =>
      $fetch<ApiResponse<OverheadCost[]>>('/api/overhead-costs', {
        query: { period: toValue(period) },
      }).then(r => r.data),
  })
}

export function useCreateOverheadCost() {
  const cache = useQueryCache()
  return useMutation({
    mutation: (payload: OverheadCostPayload) =>
      $fetch<ApiResponse<OverheadCost>>('/api/overhead-costs', { method: 'POST', body: payload }).then(r => r.data),
    // El CIF cambia el prorrateo → invalida también el costeo de platos.
    onSettled: () => Promise.all([
      cache.invalidateQueries({ key: ['overhead-costs'] }),
      cache.invalidateQueries({ key: ['costing-dishes'] }),
      cache.invalidateQueries({ key: ['cost-variance'] }),
    ]),
  })
}

export function useUpdateOverheadCost() {
  const cache = useQueryCache()
  return useMutation({
    mutation: ({ id, ...payload }: Partial<OverheadCostPayload> & { id: string }) =>
      $fetch<ApiResponse<OverheadCost>>(`/api/overhead-costs/${id}`, { method: 'PATCH', body: payload }).then(r => r.data),
    onSettled: () => Promise.all([
      cache.invalidateQueries({ key: ['overhead-costs'] }),
      cache.invalidateQueries({ key: ['costing-dishes'] }),
      cache.invalidateQueries({ key: ['cost-variance'] }),
    ]),
  })
}

export function useDeleteOverheadCost() {
  const cache = useQueryCache()
  return useMutation({
    mutation: (id: string) =>
      $fetch<ApiResponse<null>>(`/api/overhead-costs/${id}`, { method: 'DELETE' }),
    onSettled: () => Promise.all([
      cache.invalidateQueries({ key: ['overhead-costs'] }),
      cache.invalidateQueries({ key: ['costing-dishes'] }),
      cache.invalidateQueries({ key: ['cost-variance'] }),
    ]),
  })
}

// ===== Costeo de platos (HU-06-01/03/04) =====
export interface DishCost {
  menuItemId: string
  name: string
  sellPrice: string
  ingredientCost: string
  unitsSold: number
  cifPerUnit: string
  fullCost: string
  foodCostPct: string
  marginPct: string
  contributionMargin: string
}

export interface PeriodCosting {
  period: string
  totalCIF: string
  totalUnits: number
  cifPerUnit: string
  allocationBase: 'units'
  dishes: DishCost[]
}

/** Costeo de los platos activos en un período (ingredientes + CIF prorrateado, margen). */
export function useDishCosting(period: MaybeRefOrGetter<string>, enabled?: MaybeRefOrGetter<boolean>) {
  return useQuery({
    key: () => ['costing-dishes', toValue(period)] as const,
    enabled: () => (enabled ? toValue(enabled) : true),
    query: () =>
      $fetch<ApiResponse<PeriodCosting>>('/api/costing/dishes', {
        query: { period: toValue(period) },
      }).then(r => r.data),
  })
}

// ===== Sugerencia de precio (HU-06-05) =====
export interface SuggestPrice {
  menuItemId: string
  period: string
  fullCost: string
  targetMarginPct: string
  suggestedPrice: string
}

/** Precio sugerido puntual para un margen objetivo (fórmula determinista, no IA). */
export function useSuggestPrice() {
  return (menuItemId: string, targetMarginPct: number, period: string) =>
    $fetch<ApiResponse<SuggestPrice>>('/api/costing/suggest-price', {
      query: { menuItemId, targetMarginPct, period },
    }).then(r => r.data)
}

// ===== Comparativo costo real vs teórico (HU-06-07) =====
export interface CostVariance {
  period: string
  theoreticalCost: string
  realCost: string
  variance: string
  variancePct: string
  byType: { waste: string, sale: string }
  note: string
}

export function useCostVariance(period: MaybeRefOrGetter<string>, enabled?: MaybeRefOrGetter<boolean>) {
  return useQuery({
    key: () => ['cost-variance', toValue(period)] as const,
    enabled: () => (enabled ? toValue(enabled) : true),
    query: () =>
      $fetch<ApiResponse<CostVariance>>('/api/costing/cost-variance', {
        query: { period: toValue(period) },
      }).then(r => r.data),
  })
}

// ===== Cierre de período (HU-06-06) =====
export interface CostingClose {
  id: string
  period: string
  totalCIF: string
  totalUnits: number
  totalIngredientCost: string
  totalRevenue: string
  totalContribution: string
  closedAt: string
  userId: string | null
  snapshot: PeriodCosting
}

/** Lista de cierres del tenant (más reciente primero). */
export function useCostingCloses(enabled?: MaybeRefOrGetter<boolean>) {
  return useQuery({
    key: () => ['costing-closes'] as const,
    enabled: () => (enabled ? toValue(enabled) : true),
    query: () =>
      $fetch<ApiResponse<CostingClose[]>>('/api/costing/closes').then(r => r.data),
  })
}

/** Cierra un período (POST). Invalida la lista de cierres. Recerrar → 409. */
export function useCloseCosting() {
  const cache = useQueryCache()
  return useMutation({
    mutation: (period: string) =>
      $fetch<ApiResponse<CostingClose>>('/api/costing/close', { method: 'POST', body: { period } }).then(r => r.data),
    onSettled: () => cache.invalidateQueries({ key: ['costing-closes'] }),
  })
}
