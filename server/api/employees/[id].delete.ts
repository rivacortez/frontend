import { backendFetch } from '../../utils/backend'

interface Envelope<T> { success: boolean, data: T }

// HU-13-01 · Baja (soft-delete) de un empleado. El backend marca `active: false`
// y lo retiene en la base de datos (auditoría). El CASL del backend restringe
// esta operación a owner/manager; staff recibe 403.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Falta el id' })
  await backendFetch<Envelope<{ deleted: true }>>(event, `/api/employees/${id}`, { method: 'DELETE' })
  return ok(null)
})
