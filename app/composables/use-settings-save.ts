import type { AppSettings } from "#shared/types/domain";

/**
 * HU-01-10 · Guardado de una sección de ajustes con feedback uniforme (fix
 * E01-2). Las vistas de Ajustes hacían `try { mutate; toast } finally {}` SIN
 * `catch`, así que un 400/403 del backend (p. ej. RBAC owner-only) se propagaba
 * sin feedback y dejaba al usuario sin saber por qué no se guardó.
 *
 * Este helper centraliza el patrón correcto:
 * - toast de éxito SOLO en 2xx,
 * - toast de error claro en fallo (mensaje del backend vía `errorMessage`),
 * - el botón permanece habilitado para reintentar (no se bloquea la vista).
 *
 * @param section sección de `AppSettings` a actualizar (`business`, `hours`, …).
 * @param successTitle copy del toast de éxito.
 * @returns `save(payload)` (resuelve `true` en 2xx, `false` en error) y `saving`.
 */
export function useSettingsSave<S extends keyof AppSettings>(
  section: S,
  successTitle: string,
) {
  const update = useUpdateSettings(section);
  const toast = useToast();
  const saving = ref(false);

  async function save(payload: Partial<AppSettings[S]>): Promise<boolean> {
    if (saving.value) return false;
    saving.value = true;
    try {
      await update.mutateAsync(payload);
      toast.add({ title: successTitle, icon: "i-lucide-check" });
      return true;
    } catch (error) {
      toast.add({
        title: errorMessage(error, "No se pudieron guardar los cambios"),
        color: "error",
        icon: "i-lucide-alert-circle",
      });
      return false;
    } finally {
      saving.value = false;
    }
  }

  return { save, saving };
}
