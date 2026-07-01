import { backendFetch } from '../../utils/backend'
import type { EmployeeView } from './index.get'

interface Envelope<T> { success: boolean, data: T }

// HU-13-01 · Detalle de un empleado por id.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Falta el id' })
  const res = await backendFetch<Envelope<EmployeeView>>(event, `/api/employees/${id}`)
  return ok(res.data)
})
