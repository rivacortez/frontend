import { backendFetch } from '../../utils/backend'

interface Envelope<T> { success: boolean, data: T }

// Elimina una zona (HU-03-01). El backend devuelve 409 si la zona tiene mesas
// (mensaje propagado por backendFetch → se muestra como toast en pantalla).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Falta el id' })
  await backendFetch<Envelope<{ deleted: true }>>(event, `/api/zones/${id}`, { method: 'DELETE' })
  return ok(null)
})
