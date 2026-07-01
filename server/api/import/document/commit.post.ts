import { z } from "zod";
import { backendFetch } from "../../../utils/backend";

// Item schemas mirror the NestJS backend ImportMenuItemDto / ImportIngredientDto.
// We validate here at the BFF edge so malformed clients never reach the backend.

const menuItemSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  price: z.number().min(0, "El precio no puede ser negativo"),
  category: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

const ingredientSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  unit: z.string().nullable().optional(),
  estimatedCost: z.number().min(0).nullable().optional(),
});

const commitSchema = z.object({
  menuItems: z.array(menuItemSchema),
  ingredients: z.array(ingredientSchema),
});

interface CommitResult {
  created: { ingredients: number; menuItems: number; categories: number };
  skipped: string[];
}

interface BackendEnvelope<T> {
  success: boolean;
  data: T;
}

/**
 * BFF proxy for `POST /api/import/document/commit` (NestJS backend).
 *
 * Receives the user-reviewed import payload (menu items + ingredients),
 * validates it at the BFF edge with Zod, then forwards it to the backend
 * which creates the entities under the tenant. The operation is idempotent
 * by name — items with names already in the catalog are skipped (not duplicated).
 *
 * RBAC: owner/manager only. Staff → 403 (enforced here and at the backend).
 *
 * @param event - H3 event with the JSON body.
 * @returns `{ success: true, data: CommitResult }` with created counts and skipped names.
 * @throws 400 on validation errors; 403 on RBAC; 502 on backend failures.
 */
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (session.user?.role === "staff") {
    throw createError({ statusCode: 403, statusMessage: "Acceso restringido" });
  }

  const body = await readValidatedBody(event, commitSchema.parse);

  const res = await backendFetch<BackendEnvelope<CommitResult>>(
    event,
    "/api/import/document/commit",
    { method: "POST", body },
  );

  return ok(res.data);
});
