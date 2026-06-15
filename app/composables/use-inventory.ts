import type { ApiResponse } from '#shared/types/api'
import type { Ingredient, InventoryMovement, MovementType, ShoppingItem } from '#shared/types/domain'

export function useMovements(ingredientId?: MaybeRefOrGetter<string | undefined>) {
  return useQuery({
    key: () => ['movements', toValue(ingredientId) ?? 'all'] as const,
    query: () =>
      $fetch<ApiResponse<InventoryMovement[]>>('/api/inventory/movements', {
        query: { ingredientId: toValue(ingredientId) || undefined },
      }).then(r => r.data),
  })
}

export function useCreateMovement() {
  const cache = useQueryCache()
  return useMutation({
    mutation: (payload: { ingredientId: string, type: MovementType, qty: number, note?: string, user?: string }) =>
      $fetch<ApiResponse<{ movement: InventoryMovement, ingredient: Ingredient }>>(
        '/api/inventory/movements',
        { method: 'POST', body: payload },
      ).then(r => r.data),
    onSettled: () => Promise.all([
      cache.invalidateQueries({ key: ['movements'] }),
      cache.invalidateQueries({ key: ['ingredients'] }),
    ]),
  })
}

export function useShoppingList() {
  return useQuery({
    key: ['shopping-list'],
    query: () =>
      $fetch<ApiResponse<ShoppingItem[]>>('/api/inventory/shopping-list').then(r => r.data),
  })
}

export function usePatchShoppingItem() {
  const cache = useQueryCache()
  return useMutation({
    mutation: ({ id, ...payload }: { id: string, checked?: boolean, suggestedQty?: number }) =>
      $fetch<ApiResponse<ShoppingItem>>(`/api/inventory/shopping-list/${id}`, {
        method: 'PATCH',
        body: payload,
      }).then(r => r.data),
    onSettled: () => cache.invalidateQueries({ key: ['shopping-list'] }),
  })
}

export function useAddShoppingItem() {
  const cache = useQueryCache()
  return useMutation({
    mutation: (payload: { ingredientId: string, suggestedQty?: number }) =>
      $fetch<ApiResponse<ShoppingItem>>('/api/inventory/shopping-list', {
        method: 'POST',
        body: payload,
      }).then(r => r.data),
    onSettled: () => cache.invalidateQueries({ key: ['shopping-list'] }),
  })
}
