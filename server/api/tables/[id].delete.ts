import { backendFetch } from '../../utils/backend'

interface Envelope<T> { success: boolean, data: T }

// Eliminar mesa = configurar el salón → owner/manager (CASL delete Table). El
// backend devuelve 409 si la mesa no está libre (mensaje propagado → toast).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Falta el id' })
  await backendFetch<Envelope<{ deleted: true }>>(event, `/api/tables/${id}`, { method: 'DELETE' })
  return ok(null)
})
