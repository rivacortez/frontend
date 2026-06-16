import { backendFetch } from '../../utils/backend'

interface Envelope<T> { success: boolean, data: T }

// `TableView` CRUDO del backend E03 — para la pantalla de CONFIG del salón
// (zonas/mesas), que necesita `code`/`zoneId`/`capacity`/`status` tal cual.
// (El `GET /api/tables` del POS pasa por `pos-adapter` → `DiningTable`, que
// pierde el `code` string y el `zoneId`; aquí NO mapeamos, para la config.)
export interface TableConfigView {
  id: string
  zoneId: string
  zoneName: string
  code: string
  capacity: number
  status: string
  posX: number | null
  posY: number | null
}

// Proxy autenticado → backend GET /api/tables (read Table = owner/manager/staff).
export default defineEventHandler(async (event) => {
  const res = await backendFetch<Envelope<TableConfigView[]>>(event, '/api/tables')
  return ok(res.data, { totalCount: res.data.length, page: 1 })
})
