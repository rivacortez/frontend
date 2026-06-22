<script setup lang="ts">
// Topbar única del shell: vive en el layout, así cubre TODAS las vistas. El
// título sale del header declarado por la página (definePageHeader / ScreenHeader)
// y cae al título de ruta si la vista no declara nada. Las acciones contextuales
// de cada vista se inyectan por teleport en `#topbar-actions`.
const ph = usePageHeaderState()
const routeTitle = useRouteTitle()
const router = useRouter()

const colorMode = useColorMode()
function toggleTheme(): void {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

const { data: unread } = useUnreadCount()
const unreadCount = computed(() => unread.value ?? 0)

const title = computed(() => ph.value.title ?? routeTitle.value)
const subtitle = computed(() => ph.value.subtitle)
const showBack = computed(() => ph.value.hasBack)

function goBack(): void {
  // Prioriza el historial real (vuelve a donde vino); el `back` declarado es
  // respaldo para deep-link / recarga sin historial dentro de la app.
  const hasInAppHistory = Boolean(router.options.history.state?.back)
  if (hasInAppHistory) router.back()
  else void navigateTo(ph.value.back ?? '/app')
}
</script>

<template>
  <header class="topbar">
    <div class="tb-left">
      <ClientOnly>
        <button
          v-if="showBack"
          type="button"
          class="tb-back"
          aria-label="Volver"
          @click="goBack"
        >
          <UIcon name="i-lucide-arrow-left" class="tb-back-ico" />
        </button>
        <div class="tb-titles">
          <h1 class="tb-title">{{ title }}</h1>
          <p v-if="subtitle" class="tb-sub">{{ subtitle }}</p>
        </div>
        <template #fallback>
          <div class="tb-titles">
            <h1 class="tb-title">{{ routeTitle }}</h1>
          </div>
        </template>
      </ClientOnly>
    </div>

    <div class="tb-right">
      <!-- Acciones globales (idénticas en TODAS las vistas) -->
      <ClientOnly>
        <button
          type="button"
          class="tb-icon"
          :aria-label="colorMode.value === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'"
          @click="toggleTheme"
        >
          <UIcon :name="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'" class="tb-icon-glyph" />
        </button>
        <template #fallback>
          <button type="button" class="tb-icon" aria-label="Cambiar tema">
            <UIcon name="i-lucide-moon" class="tb-icon-glyph" />
          </button>
        </template>
      </ClientOnly>
      <NuxtLink
        to="/app/notificaciones"
        class="tb-icon"
        :aria-label="unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'"
      >
        <UIcon name="i-lucide-bell" class="tb-icon-glyph" />
        <ClientOnly>
          <span v-if="unreadCount > 0" class="tb-badge" aria-hidden="true">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
        </ClientOnly>
      </NuxtLink>
      <NuxtLink to="/app/ajustes" class="tb-icon" aria-label="Ajustes del negocio">
        <UIcon name="i-lucide-settings" class="tb-icon-glyph" />
      </NuxtLink>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  min-height: 60px;
  padding: 10px clamp(20px, 4vw, 40px);
  padding-top: calc(10px + env(safe-area-inset-top, 0px));
  /* Superficie elevada blanca, igual que el sidebar */
  background: var(--pure-white);
  border-bottom: 1px solid var(--border);
  box-shadow: 0 4px 24px rgba(26, 26, 26, 0.035);
}

.tb-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
.tb-back {
  width: 36px; height: 36px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 10px;
  background: var(--bg-card); border: 1px solid var(--border-subtle);
  color: var(--fg2); cursor: pointer;
  transition: background var(--dur) var(--ease-standard), border-color var(--dur) var(--ease-standard);
}
.tb-back:hover { background: var(--crema-100); border-color: var(--border); }
.tb-back:focus-visible { outline: 2px solid var(--terracotta); outline-offset: 1px; }
.tb-back-ico { width: 18px; height: 18px; }

.tb-titles { min-width: 0; }
.tb-title {
  font-family: var(--font-display);
  font-size: clamp(18px, 1.6vw, 21px);
  font-weight: 600; letter-spacing: -0.02em; line-height: 1.15;
  color: var(--fg1); margin: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tb-sub { font-size: 12.5px; color: var(--fg3); margin: 2px 0 0; line-height: 1.2; }

.tb-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.tb-actions { display: flex; align-items: center; gap: 8px; }
.tb-actions:empty { display: none; }

.tb-icon {
  width: 38px; height: 38px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 10px;
  background: var(--bg-card); border: 1px solid var(--border-subtle);
  color: var(--fg2);
  transition: background var(--dur) var(--ease-standard), border-color var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.tb-icon:hover { background: var(--crema-100); border-color: var(--border); color: var(--fg1); }
.tb-icon:focus-visible { outline: 2px solid var(--terracotta); outline-offset: 1px; }
.tb-icon-glyph { width: 18px; height: 18px; }
.tb-icon { position: relative; }
.tb-badge {
  position: absolute; top: -4px; right: -4px;
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
  background: var(--terracotta); color: var(--crema-100);
  font-size: 11px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
  border: 2px solid var(--bg);
}
</style>
