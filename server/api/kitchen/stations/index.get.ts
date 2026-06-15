import { backendFetch } from '../../../utils/backend'

interface ApiEnvelope<T> {
  success: boolean
  data: T
}

// HU-03-07 · Estación de cocina (vista del backend; ya viene frontend-friendly).
interface KitchenStationView {
  id: string
  name: string
  position: number
}

// Proxy autenticado → backend E03: GET /api/kitchen/stations.
// El backend aplica JwtAuthGuard + CASL ('read' Kitchen → staff ✓). Sin adapter:
// la forma del backend coincide con lo que consume el KDS.
export default defineEventHandler((event) => {
  return backendFetch<ApiEnvelope<KitchenStationView[]>>(event, '/api/kitchen/stations')
})
