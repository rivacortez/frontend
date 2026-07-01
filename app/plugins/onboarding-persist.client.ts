import {
  ONBOARDING_STORAGE_KEY,
  useOnboardingStore,
} from "~/stores/onboarding";

/**
 * E01-3 · Persistencia del wizard de registro.
 *
 * El store de onboarding es in-memory: una recarga manual lo reseteaba y los
 * guards de página (`if (!store.account.email) navigateTo('/registro')`)
 * rebotaban al paso 1 con los datos vacíos (pérdida silenciosa de progreso).
 *
 * Aquí, ANTES de que se monten las páginas, hidratamos el store desde
 * `sessionStorage` y luego volcamos cada mutación. Como `/registro/**` corre
 * como SPA (ver `routeRules` en `nuxt.config`), este plugin cliente se ejecuta
 * antes que los guards, que ya encuentran el progreso restaurado.
 *
 * Por qué `sessionStorage` (y no local): el registro es un flujo efímero de una
 * sola sesión; no queremos arrastrar credenciales a medio escribir entre
 * pestañas ni conservarlas tras cerrar el navegador. Al completar el alta,
 * `listo.vue` hace `store.$reset()`, cuyo volcado deja la sesión limpia.
 */
export default defineNuxtPlugin(() => {
  const store = useOnboardingStore();

  const saved = sessionStorage.getItem(ONBOARDING_STORAGE_KEY);
  if (saved) {
    try {
      store.$patch(JSON.parse(saved) as Partial<typeof store.$state>);
    } catch {
      // JSON corrupto: descartar y empezar limpio.
      sessionStorage.removeItem(ONBOARDING_STORAGE_KEY);
    }
  }

  // `detached`: la suscripción debe sobrevivir al ciclo de vida del plugin.
  store.$subscribe(
    (_mutation, state) => {
      sessionStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
    },
    { detached: true },
  );
});
