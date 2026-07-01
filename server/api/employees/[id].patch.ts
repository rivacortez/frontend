import { z } from 'zod'
import { backendFetch } from '../../utils/backend'
import type { EmployeeView } from './index.get'

interface Envelope<T> { success: boolean, data: T }

const POSITION_VALUES = ['mozo', 'cocina', 'caja', 'otro'] as const

const patchEmployeeSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  dni: z.string().min(1).optional(),
  position: z.enum(POSITION_VALUES).optional(),
  phone: z.string().min(1).nullable().optional(),
  hiredAt: z.string().nullable().optional(),
  active: z.boolean().optional(),
  userId: z.string().uuid().nullable().optional(),
  /**
   * Salary is accepted in the schema but only forwarded to the backend when
   * the session role is 'owner'. Managers cannot update salary.
   */
  salary: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
})

// HU-13-01 · Edición parcial de un empleado. Salary gating idéntico al POST:
// solo se reenvía al backend si el rol de la sesión es 'owner'.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Falta el id' })

  const body = await readValidatedBody(event, patchEmployeeSchema.parse)
  const session = await getUserSession(event)
  const role = session.user?.role

  const payload: Record<string, unknown> = {
    firstName: body.firstName,
    lastName: body.lastName,
    dni: body.dni,
    position: body.position,
    phone: body.phone,
    hiredAt: body.hiredAt,
    active: body.active,
    userId: body.userId,
  }

  // Remove undefined keys so we don't send partial-update fields as null.
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) delete payload[key]
  }

  if (role === 'owner' && body.salary !== undefined) {
    payload.salary = body.salary
  }

  const res = await backendFetch<Envelope<EmployeeView>>(event, `/api/employees/${id}`, {
    method: 'PATCH',
    body: payload,
  })
  return ok(res.data)
})
