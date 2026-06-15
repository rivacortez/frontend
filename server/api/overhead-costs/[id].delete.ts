import { backendFetch } from '../../utils/backend'

interface Envelope<T> { success: boolean, data: T }

// HU-06-02 · Baja (soft-delete) de un CIF. Escritura = owner/manager (manage Report).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Falta el id' })
  await backendFetch<Envelope<{ deleted: true }>>(event, `/api/overhead-costs/${id}`, { method: 'DELETE' })
  return ok(null)
})
