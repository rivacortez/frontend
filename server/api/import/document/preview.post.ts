import { backendBase, refreshSession } from "../../../utils/backend";

/** Upstream response envelope from NestJS `/api/import/document/preview`. */
interface BackendPreviewData {
  menuItems: Array<{
    name: string;
    price: number;
    category?: string | null;
    description?: string | null;
  }>;
  ingredients: Array<{
    name: string;
    unit?: string | null;
    estimatedCost?: number | null;
  }>;
  provider: string;
  source?: { type: string; filename?: string } | null;
}

interface BackendEnvelope<T> {
  success: boolean;
  data: T;
}

/**
 * BFF proxy for `POST /api/import/document/preview` (NestJS backend).
 *
 * Accepts a multipart/form-data upload from the browser (field name `file`),
 * relays it to the backend with the session Bearer token injected server-side,
 * and returns the AI-extracted preview. **Nothing is written to the database.**
 *
 * Handles transparent access-token refresh (one retry on 401) so the client
 * never needs to deal with token expiry.
 *
 * RBAC: owner/manager only. Staff receives 403 here before we even touch
 * the backend (plus the backend enforces it too).
 *
 * @param event - H3 event carrying the multipart request from the browser.
 * @returns `{ success: true, data: BackendPreviewData }` envelope.
 * @throws 400 if no file part; 401/403 on auth failures; 502 on backend errors.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const token = session.secure?.accessToken;
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: "No autenticado" });
  }
  if (session.user?.role === "staff") {
    throw createError({ statusCode: 403, statusMessage: "Acceso restringido" });
  }

  // Read multipart parts from the incoming browser request.
  const parts = await readMultipartFormData(event);
  const filePart = parts?.find((p) => p.name === "file");
  if (!filePart?.data?.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Se requiere un archivo en el campo "file"',
    });
  }

  // Reconstruct a FormData for the NestJS backend, preserving filename and
  // content-type so Multer on the backend can identify the file correctly.
  const form = new FormData();
  const blob = new Blob([filePart.data], {
    type: filePart.type ?? "application/octet-stream",
  });
  form.append("file", blob, filePart.filename ?? "upload");

  const base = backendBase(event);

  /** Send the FormData to the backend with the given Bearer token. */
  const forward = (bearer: string) =>
    $fetch<BackendEnvelope<BackendPreviewData>>(
      `${base}/api/import/document/preview`,
      {
        method: "POST",
        body: form,
        headers: { Authorization: `Bearer ${bearer}` },
      },
    );

  try {
    const res = await forward(token);
    return ok(res.data);
  } catch (error) {
    const err = error as { statusCode?: number };

    // Access token expired (15-min window): refresh once and retry.
    // Transparent to the browser — the session cookie is updated silently.
    if (err.statusCode === 401) {
      const fresh = await refreshSession(event, base);
      try {
        const res = await forward(fresh);
        return ok(res.data);
      } catch (retryError) {
        throw normalizeBackendError(retryError);
      }
    }
    throw normalizeBackendError(error);
  }
});

/**
 * Maps a backend HTTP error to an H3Error.
 * NestJS class-validator returns `message` as `string[]`; we normalise to the
 * first element so h3's `sanitizeStatusMessage` never receives an array.
 */
function normalizeBackendError(error: unknown): ReturnType<typeof createError> {
  const err = error as {
    statusCode?: number;
    data?: { error?: { message?: unknown }; message?: unknown };
  };
  const status = err.statusCode ?? 502;
  const raw = err.data?.error?.message ?? err.data?.message;
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
