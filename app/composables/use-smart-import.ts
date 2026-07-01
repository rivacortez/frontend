import type { ApiResponse } from "#shared/types/api";

/**
 * A single menu item as returned by the AI preview extraction.
 * Mirrors `ImportMenuItemDto` from the NestJS backend.
 */
export interface PreviewMenuItem {
  name: string;
  price: number;
  category?: string | null;
  description?: string | null;
}

/**
 * A single ingredient as returned by the AI preview extraction.
 * Mirrors `ImportIngredientDto` from the NestJS backend.
 */
export interface PreviewIngredient {
  name: string;
  unit?: string | null;
  estimatedCost?: number | null;
}

/**
 * Full payload returned by `POST /api/import/document/preview`.
 * Nothing is persisted at this stage — this is a read-only AI extraction result.
 *
 * @property provider - AI provider that performed the extraction (e.g. "openai").
 * @property source   - Metadata about the original document (type, filename).
 */
export interface PreviewData {
  menuItems: PreviewMenuItem[];
  ingredients: PreviewIngredient[];
  provider: string;
  source?: { type: string; filename?: string } | null;
}

/**
 * Payload sent to `POST /api/import/document/commit`.
 * Contains the user-reviewed (and possibly edited) items to persist.
 * The backend creates entities idempotently — duplicates by name are skipped.
 */
export interface CommitPayload {
  menuItems: PreviewMenuItem[];
  ingredients: PreviewIngredient[];
}

/**
 * Result returned by `POST /api/import/document/commit` after entity creation.
 *
 * @property created.menuItems    - Number of new menu items created.
 * @property created.ingredients  - Number of new ingredients created.
 * @property created.categories   - Number of new categories auto-created.
 * @property skipped              - Names that already existed and were skipped.
 */
export interface CommitResult {
  created: {
    ingredients: number;
    menuItems: number;
    categories: number;
  };
  skipped: string[];
}

/**
 * Sends a document file to the BFF for AI extraction via the backend.
 *
 * The file is uploaded as `multipart/form-data` with the field name `file`.
 * Accepted formats: .pdf, .xlsx, .csv. Nothing is written to the database.
 * The BFF injects the session Bearer token server-side (never exposed client-side).
 *
 * @example
 * ```ts
 * const preview = useSmartImportPreview()
 * const data = await preview.mutateAsync(pickedFile)
 * ```
 *
 * @returns Pinia Colada mutation; `.mutateAsync(file)` resolves to `PreviewData`.
 */
export function useSmartImportPreview() {
  return useMutation({
    mutation: (file: File): Promise<PreviewData> => {
      const form = new FormData();
      form.append("file", file);
      return $fetch<ApiResponse<PreviewData>>("/api/import/document/preview", {
        method: "POST",
        body: form,
      }).then((r) => r.data);
    },
  });
}

/**
 * Commits the user-reviewed import payload, creating the extracted entities
 * (menu items, ingredients, categories) in the tenant's catalog.
 *
 * Idempotent by name — items already in the catalog are skipped gracefully.
 * The `skipped` array in the result lists names that were not created.
 *
 * @example
 * ```ts
 * const commit = useSmartImportCommit()
 * const result = await commit.mutateAsync({ menuItems, ingredients })
 * ```
 *
 * @returns Pinia Colada mutation; `.mutateAsync(payload)` resolves to `CommitResult`.
 */
export function useSmartImportCommit() {
  return useMutation({
    mutation: (payload: CommitPayload): Promise<CommitResult> =>
      $fetch<ApiResponse<CommitResult>>("/api/import/document/commit", {
        method: "POST",
        body: payload,
      }).then((r) => r.data),
  });
}
