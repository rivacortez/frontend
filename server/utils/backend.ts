import { Buffer } from "node:buffer";
import type { H3Event } from "h3";
import type { AppRole } from "#shared/types/api";

export interface BackendTokens {
  accessToken: string;
  refreshToken: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface MeView {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

interface JwtClaims {
  sub: string;
  tenant_id: string;
  roles: string[];
}

/** Base URL del backend NestJS (NUXT_API_BASE). El cliente nunca llama directo. */
export function backendBase(event: H3Event): string {
  const { apiBase } = useRuntimeConfig(event);
  if (!apiBase) {
    throw createError({
      statusCode: 500,
      statusMessage: "NUXT_API_BASE no configurado",
    });
  }
  return apiBase;
}

/** Decodifica el payload del JWT (sin verificar — confiamos en el backend que lo emitió). */
function decodeClaims(token: string): JwtClaims {
  const payload = token.split(".")[1] ?? "";
  return JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as JwtClaims;
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
  });
  const claims = decodeClaims(tokens.accessToken);
  const user = {
    id: me.data.id,
    name: me.data.name,
    email: me.data.email,
    role: (me.data.roles[0] ?? "staff") as AppRole,
    tenantId: claims.tenant_id,
  };
  await setUserSession(event, {
    user,
    secure: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
    loggedInAt: Date.now(),
  });
  return user;
}

/**
 * Renueva la sesión usando el `refreshToken` sellado: pide tokens nuevos al backend
 * (rotación con detección de reuso del lado NestJS) y vuelve a sellar la sesión.
 * Si el refresh es inválido/expirado, LIMPIA la sesión y devuelve 401. El nuevo
 * refreshToken se guarda en `secure` (nunca llega al cliente). Devuelve el nuevo access.
 */
export async function refreshSession(
  event: H3Event,
  base: string,
): Promise<string> {
  const session = await getUserSession(event);
  const refreshToken = session.secure?.refreshToken;
  if (!refreshToken) {
    throw createError({ statusCode: 401, statusMessage: "No autenticado" });
  }
  let tokens: ApiEnvelope<BackendTokens>;
  try {
    tokens = await $fetch<ApiEnvelope<BackendTokens>>(
      `${base}/api/auth/refresh`,
      {
        method: "POST",
        body: { refreshToken },
      },
    );
  } catch {
    // Refresh rechazado (expirado/revocado/reuso) → sesión muerta: limpiar y 401.
    await clearUserSession(event);
    throw createError({ statusCode: 401, statusMessage: "Sesión expirada" });
  }
  await establishSession(event, base, tokens.data);
  return tokens.data.accessToken;
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * Llama al backend NestJS inyectando el `Bearer` de la sesión (sellado en `secure`,
 * server-only). El cliente nunca ve el token. Propaga el status del backend (401/403/…).
 * Helper reutilizable para proxear rutas protegidas a medida que el backend las exponga.
 */
export async function backendFetch<T>(
  event: H3Event,
  path: string,
  opts: {
    method?: Method;
    body?: Record<string, unknown>;
    query?: Record<string, unknown>;
  } = {},
): Promise<T> {
  const base = backendBase(event);
  const session = await getUserSession(event);
  const token = session.secure?.accessToken;
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: "No autenticado" });
  }
  const call = (bearer: string) =>
    $fetch(`${base}${path}`, {
      method: opts.method,
      body: opts.body,
      query: opts.query,
      headers: { Authorization: `Bearer ${bearer}` },
    });
  try {
    // $fetch infiere TypedInternalResponse; la URL es externa (backend) → casteamos a T.
    return (await call(token)) as unknown as T;
  } catch (error) {
    // Access token vencido (15 min) → renovar con el refresh y reintentar UNA vez.
    // Transparente para el cliente; mantiene la sesión viva sin reloguear.
    if ((error as { statusCode?: number }).statusCode === 401) {
      const fresh = await refreshSession(event, base); // lanza 401 si el refresh murió
      try {
        return (await call(fresh)) as unknown as T;
      } catch (retryError) {
        throw mapBackendError(retryError);
      }
    }
    throw mapBackendError(error);
  }
}

/**
 * Normaliza un error del backend a un H3Error con status y mensaje propagables.
 *
 * NestJS class-validator devuelve `message` como string[] (array de validaciones);
 * h3's `sanitizeStatusMessage` llama a `.replace()` sobre el valor y explota si
 * recibe un array. Normalizamos a string antes de pasarlo a `createError`.
 */
function mapBackendError(error: unknown) {
  const err = error as {
    statusCode?: number;
    data?: { error?: { message?: unknown }; message?: unknown };
  };
  const status = err.statusCode ?? 502;
  const raw = err.data?.error?.message ?? err.data?.message;
  // Normaliza arrays (class-validator) a su primer elemento; rechaza tipos no-string.
  const message = Array.isArray(raw)
    ? ((raw[0] as string) ?? "Error del backend")
    : typeof raw === "string"
      ? raw
      : "Error del backend";
  return createError({
    statusCode: status,
    statusMessage: message,
    data: { message },
  });
}

/**
 * Reenvía una descarga `text/csv` del backend a través del BFF (E07 · HU-07-10,
 * `?format=csv`). Pide el cuerpo CRUDO (`responseType: 'text'`, sin parsear como
 * JSON), copia las cabeceras de descarga del backend (`Content-Type` y
 * `Content-Disposition` → nombre de archivo) a la respuesta y devuelve el cuerpo
 * tal cual. El RBAC del backend corre antes (staff → 403 también para CSV).
 */
export async function proxyCsv(
  event: H3Event,
  path: string,
  query: Record<string, unknown> = {},
): Promise<string> {
  const base = backendBase(event);
  const session = await getUserSession(event);
  const token = session.secure?.accessToken;
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: "No autenticado" });
  }
  try {
    const csv = await $fetch<string>(`${base}${path}`, {
      query,
      responseType: "text",
      headers: { Authorization: `Bearer ${token}`, Accept: "text/csv" },
      onResponse({ response }) {
        // Copia las cabeceras de descarga del backend a la respuesta del BFF.
        const disposition = response.headers.get("content-disposition");
        setResponseHeader(event, "content-type", "text/csv; charset=utf-8");
        if (disposition)
          setResponseHeader(event, "content-disposition", disposition);
      },
    });
    return csv;
  } catch (error) {
    const err = error as {
      statusCode?: number;
      data?: { error?: { message?: string }; message?: string };
    };
    const status = err.statusCode ?? 502;
    const message =
      err.data?.error?.message ?? err.data?.message ?? "Error del backend";
    throw createError({
      statusCode: status,
      statusMessage: message,
      data: { message },
    });
  }
}
