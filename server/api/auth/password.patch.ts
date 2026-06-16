import { changePasswordSchema } from '#shared/schemas/auth'
import { backendFetch } from '../../utils/backend'

// HU-01-06 · Cambio de contraseña. Proxy autenticado a PATCH /api/auth/password:
// el backend verifica la contraseña actual y aplica la nueva (política fuerte). El
// Bearer se inyecta desde la sesión sellada (backendFetch); el cliente nunca lo ve.
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, changePasswordSchema.parse)
  await backendFetch(event, '/api/auth/password', { method: 'PATCH', body })
  return { success: true as const, data: { changed: true } }
})
