import type { ApiResponse } from '#shared/types/api'
import type { Ingredient } from '#shared/types/domain'

export function useIngredients(q?: MaybeRefOrGetter<string>) {
  return useQuery({
    key: () => ['ingredients', toValue(q) ?? ''] as const,
    query: () =>
      $fetch<ApiResponse<Ingredient[]>>('/api/ingredients', {
        query: { q: toValue(q) || undefined },
      }).then(r => r.data),
  })
}

export function useUpdateIngredient() {
  const cache = useQueryCache()
  return useMutation({
    mutation: ({ id, ...payload }: { id: string, name?: string, category?: string, unit?: string, unitCost?: number, minStock?: number, stock?: number }) =>
      $fetch<ApiResponse<Ingredient>>(`/api/ingredients/${id}`, {
        method: 'PATCH',
        body: payload,
      }).then(r => r.data),
    onSettled: () => cache.invalidateQueries({ key: ['ingredients'] }),
  })
}
