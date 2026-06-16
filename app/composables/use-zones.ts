import type { ApiResponse } from '#shared/types/api'

// HU-03-01 · Zonas del salón (E03). El backend devuelve `position` para ordenar.
export interface Zone {
  id: string
  name: string
  position: number
}

export interface ZonePayload {
  name: string
  position?: number
}

export function useZones() {
  return useQuery({
    key: () => ['zones'] as const,
    query: () => $fetch<ApiResponse<Zone[]>>('/api/zones').then(r => r.data),
  })
}

export function useCreateZone() {
  const cache = useQueryCache()
  return useMutation({
    mutation: (payload: ZonePayload) =>
      $fetch<ApiResponse<Zone>>('/api/zones', { method: 'POST', body: payload }).then(r => r.data),
    onSettled: () => cache.invalidateQueries({ key: ['zones'] }),
  })
}

export function useUpdateZone() {
  const cache = useQueryCache()
  return useMutation({
    mutation: ({ id, ...payload }: Partial<ZonePayload> & { id: string }) =>
      $fetch<ApiResponse<Zone>>(`/api/zones/${id}`, { method: 'PATCH', body: payload }).then(r => r.data),
    onSettled: () => cache.invalidateQueries({ key: ['zones'] }),
  })
}

export function useDeleteZone() {
  const cache = useQueryCache()
  return useMutation({
    // 409 si la zona tiene mesas (el backend lo bloquea) → el caller lo muestra como toast.
    mutation: (id: string) =>
      $fetch<ApiResponse<null>>(`/api/zones/${id}`, { method: 'DELETE' }),
    onSettled: () => cache.invalidateQueries({ key: ['zones'] }),
  })
}
