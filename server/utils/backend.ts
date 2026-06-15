import { Buffer } from 'node:buffer'
import type { H3Event } from 'h3'
import type { AppRole } from '#shared/types/api'

export interface BackendTokens {
  accessToken: string
  refreshToken: string
}

interface ApiEnvelope<T> {
  success: boolean
  data: T
}

interface MeView {
  id: string
  email: string
  name: string
  roles: string[]
}

interface JwtClaims {
  sub: string
  tenant_id: string
  roles: string[]
}

/** Base URL del backend NestJS (NUXT_API_BASE). El cliente nunca llama directo. */
export function backendBase(event: H3Event): string {
  const { apiBase } = useRuntimeConfig(event)
  if (!apiBase) {
    throw createError({ statusCode: 500, statusMessage: 'NUXT_API_BASE no configurado' })
  }
  return apiBase
}

/** Decodifica el payload del JWT (sin verificar — confiamos en el backend que lo emitió). */
function decodeClaims(token: string): JwtClaims {
  const payload = token.split('.')[1] ?? ''
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as JwtClaims
}

/**
 * Con los tokens de NestJS: obtiene el usuario (/api/auth/me), arma el `User` del
 * frontend y **sella los tokens en la sesión** (cookie httpOnly, parte `secure` →
 * nunca llega al cliente). Devuelve el `User` para la respuesta del BFF.
 */
export async function establishSession(
  event: H3Event,
  base: string,
  tokens: BackendTokens,
) {
  const me = await $fetch<ApiEnvelope<MeView>>(`${base}/api/auth/me`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  })
  const claims = decodeClaims(tokens.accessToken)
  const user = {
    id: me.data.id,
    name: me.data.name,
    email: me.data.email,
    role: (me.data.roles[0] ?? 'staff') as AppRole,
    tenantId: claims.tenant_id,
  }
  await setUserSession(event, {
    user,
    secure: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
    loggedInAt: Date.now(),
  })
  return user
}
