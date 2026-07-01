/**
 * Named route middleware that restricts access to owner and manager roles.
 *
 * Usage: definePageMeta({ middleware: 'require-manager' })
 *
 * Staff users are redirected to /app/inventario — a page they CAN access —
 * with an informative toast so they understand WHY they were redirected.
 * The redirect prevents the misleading "empty list" state that appears when
 * the backend returns 403 and the query falls back to null data.
 *
 * NOTE: Authentication (unauthenticated → /ingresar) is handled separately
 * by auth.global.ts; this middleware only enforces role-level RBAC.
 */
export default defineNuxtRouteMiddleware(() => {
  const { user } = useUserSession();
  const role = user.value?.role;

  // Only staff is explicitly blocked; owner and manager pass through.
  // Null/undefined role means unauthenticated — auth.global.ts handles that.
  if (role === "staff") {
    useToast().add({
      title: "Acceso restringido",
      description:
        "Esta sección está disponible solo para propietarios y gerentes.",
      color: "warning",
      icon: "i-lucide-shield-alert",
    });
    return navigateTo("/app/inventario");
  }
});
