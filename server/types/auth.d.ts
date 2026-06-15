// Augmentación de #auth-utils para el contexto SERVER (Nitro). La de app/types/
// solo aplica al cliente; el BFF necesita leer session.secure server-side.
declare module '#auth-utils' {
  interface SecureSessionData {
    accessToken: string
    refreshToken: string
  }
}

export {}
