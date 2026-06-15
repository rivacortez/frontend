import { registerSchema } from '#shared/schemas/auth'
import { backendBase, establishSession, type BackendTokens } from '../../utils/backend'

interface ApiEnvelope<T> {
  success: boolean
  data: T
}

// Proxy al backend NestJS: registra el restaurante (tenant + owner) vía
// /api/auth/register y deja la sesión iniciada. (Reemplaza el mock.)
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, registerSchema.parse)
  const base = backendBase(event)

  let tokens: BackendTokens
  try {
    const res = await $fetch<ApiEnvelope<BackendTokens>>(`${base}/api/auth/register`, {
      method: 'POST',
      body,
    })
    tokens = res.data
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode === 409 ? 409 : 400
    throw createError({
      statusCode: status,
      statusMessage:
        status === 409 ? 'El email ya está registrado' : 'Datos de registro inválidos',
    })
  }

  const user = await establishSession(event, base, tokens)
  return { success: true as const, data: { user } }
})
