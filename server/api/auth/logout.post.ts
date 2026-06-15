// TODO(HU-01-08): además de limpiar la cookie, llamar a POST /api/auth/logout del
// backend (con session.secure.refreshToken) para REVOCAR el refresh token server-side.
// El backend ya expone el endpoint (specs/e01/HU-01-03-y-08); falta cablearlo aquí.
export default defineEventHandler(async (event) => {
  await clearUserSession(event)
  return { success: true as const, data: null }
})
