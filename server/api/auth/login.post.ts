import { loginSchema } from '#shared/schemas/auth'
import { backendBase, establishSession, type BackendTokens } from '../../utils/backend'

interface ApiEnvelope<T> {
  success: boolean
  data: T
}

// Proxy al backend NestJS: valida credenciales contra /api/auth/login, sella los
// tokens en la cookie de sesión e inyecta el User al cliente. (Reemplaza el mock.)
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, loginSchema.parse)
  const base = backendBase(event)

  let tokens: BackendTokens
  try {
    const res = await $fetch<ApiEnvelope<BackendTokens>>(`${base}/api/auth/login`, {
      method: 'POST',
      body,
    })
    tokens = res.data
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Credenciales inválidas' })
  }

  const user = await establishSession(event, base, tokens)
  return { success: true as const, data: { user } }
})
