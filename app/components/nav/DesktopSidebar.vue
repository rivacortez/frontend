<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const sections = useAppNavSections()
const route = useRoute()
const { user, clear } = useUserSession()
const { collapsed, toggle } = useSidebar()
const { isFavorite, toggle: toggleFav, ids: favIds } = useNavFavorites()

const canManage = computed(
  () => user.value?.role === 'owner' || user.value?.role === 'manager',
)

// Secciones visibles según rol (oculta entradas de gestión a staff y secciones vacías).
// La primera sección (sin título propio) se rotula "Menú" como en un shell SaaS.
const visibleSections = computed<AppNavSection[]>(() =>
  sections
    .map((s, i) => ({
      ...s,
      title: s.title ?? (i === 0 ? 'Menú' : undefined),
      items: s.items.filter(item => !item.manageOnly || canManage.value),
    }))
    .filter(s => s.items.length > 0),
)

// Buscador: filtra los ítems del menú por etiqueta. Vacío => navegación completa.
const query = ref('')
const displaySections = computed<AppNavSection[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return visibleSections.value
  return visibleSections.value
    .map(s => ({ ...s, items: s.items.filter(i => i.label.toLowerCase().includes(q)) }))
    .filter(s => s.items.length > 0)
})
const noResults = computed(() => query.value.trim() !== '' && displaySections.value.length === 0)

// Favoritos: resuelve los ids fijados a ítems reales visibles para el rol, en el
// orden en que el usuario los fijó.
const allItems = computed<AppNavItem[]>(() => visibleSections.value.flatMap(s => s.items))
const favItems = computed<AppNavItem[]>(() =>
  favIds.value
    .map(id => allItems.value.find(i => i.id === id))
    .filter((i): i is AppNavItem => Boolean(i)),
)
const favOpen = ref(true)
const FAV_COLORS = ['var(--terracotta)', 'var(--oliva)', '#d8a441', '#5b8c7b', '#b5683f']
const favColor = (i: number): string => FAV_COLORS[i % FAV_COLORS.length]!

function isActive(item: AppNavItem): boolean {
  return item.exact ? route.path === item.to : route.path.startsWith(item.to)
}

async function logout(): Promise<void> {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/ingresar')
}

const initials = computed(() =>
  (user.value?.name ?? user.value?.email ?? '?')
    .split(/[\s@.]+/)
    .map(part => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase(),
)

const roleLabel = computed(() => {
  const map: Record<string, string> = { owner: 'Dueño', manager: 'Gerente', staff: 'Salón' }
  return map[user.value?.role ?? ''] ?? user.value?.role ?? ''
})

const accountItems = computed<DropdownMenuItem[][]>(() => [
  [{ label: user.value?.name ?? 'Mi cuenta', type: 'label' }],
  [
    { label: 'Perfil', icon: 'i-lucide-user', to: '/app/perfil' },
    { label: 'Ayuda', icon: 'i-lucide-circle-help', to: '/app/ayuda' },
  ],
  [{ label: 'Cerrar sesión', icon: 'i-lucide-log-out', color: 'error', onSelect: () => { void logout() } }],
])
</script>

<template>
  <aside
    class="sidebar hidden lg:flex"
    :class="{ 'is-collapsed': collapsed }"
    aria-label="Navegación principal"
  >
    <!-- 1 · Marca + toggle colapsar -->
    <div class="brand-bar" :class="{ 'is-collapsed': collapsed }">
      <NuxtLink v-if="!collapsed" to="/app" class="brand" aria-label="Ir al inicio">
        <img src="/img/gastronomia-logo.svg" alt="GastronomIA" class="brand-logo">
      </NuxtLink>
      <UTooltip
        :text="collapsed ? 'Expandir menú' : 'Colapsar menú'"
        :content="{ side: 'right', sideOffset: 8 }"
      >
        <button
          type="button"
          class="collapse-btn"
          :aria-label="collapsed ? 'Expandir menú' : 'Colapsar menú'"
          :aria-pressed="collapsed"
          @click="toggle"
        >
          <UIcon
            :name="collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'"
            class="collapse-ico"
          />
        </button>
      </UTooltip>
    </div>

    <!-- 2 · Cuenta (arriba) -->
    <div class="acct-wrap" :class="{ 'is-collapsed': collapsed }">
      <UDropdownMenu
        :items="accountItems"
        :content="{ side: collapsed ? 'right' : 'bottom', align: collapsed ? 'start' : 'start', sideOffset: 8 }"
        :ui="{ content: 'w-[228px]' }"
      >
        <button type="button" class="account" :class="{ 'is-collapsed': collapsed }" aria-label="Menú de cuenta">
          <span class="avatar" aria-hidden="true">{{ initials }}</span>
          <span v-if="!collapsed" class="account-meta">
            <span class="account-name">{{ user?.name ?? user?.email }}</span>
            <span class="account-role">{{ roleLabel }}</span>
          </span>
          <UIcon v-if="!collapsed" name="i-lucide-chevrons-up-down" class="account-caret" />
        </button>
      </UDropdownMenu>
    </div>

    <!-- 3 · Buscador (oculto en colapsado) -->
    <div v-if="!collapsed" class="search">
      <UIcon name="i-lucide-search" class="search-ico" />
      <input
        v-model="query"
        type="search"
        class="search-input"
        placeholder="Buscar en el menú…"
        aria-label="Buscar en el menú"
      >
    </div>

    <!-- 4 · Navegación (scrolleable) -->
    <nav class="nav-scroll">
      <!-- Favoritos -->
      <ClientOnly>
        <div v-if="!collapsed && !query && favItems.length" class="nav-section">
          <button
            type="button"
            class="fav-head"
            :aria-expanded="favOpen"
            @click="favOpen = !favOpen"
          >
            <span>Favoritos</span>
            <UIcon
              name="i-lucide-chevron-down"
              class="fav-caret"
              :class="{ 'is-closed': !favOpen }"
            />
          </button>
          <ul v-show="favOpen" class="nav-list">
            <li v-for="(item, i) in favItems" :key="`fav-${item.id}`">
              <NuxtLink
                :to="item.to"
                class="nav-item"
                :class="{ 'is-active': isActive(item) }"
                :aria-current="isActive(item) ? 'page' : undefined"
              >
                <span class="fav-dot" :style="{ background: favColor(i) }" aria-hidden="true" />
                <span class="nav-label">{{ item.label }}</span>
              </NuxtLink>
            </li>
          </ul>
        </div>
      </ClientOnly>

      <!-- Grupos del menú -->
      <div
        v-for="(section, i) in displaySections"
        :key="section.title ?? `main-${i}`"
        class="nav-section"
      >
        <p v-if="section.title && !collapsed" class="nav-section-label">{{ section.title }}</p>
        <span v-else-if="section.title" class="nav-section-divider" aria-hidden="true" />

        <ul class="nav-list">
          <li v-for="item in section.items" :key="item.id" class="nav-row">
            <UTooltip
              :text="item.label"
              :disabled="!collapsed"
              :content="{ side: 'right', sideOffset: 8 }"
            >
              <NuxtLink
                :to="item.to"
                class="nav-item"
                :class="{ 'is-active': isActive(item), 'is-brand': item.brand }"
                :aria-current="isActive(item) ? 'page' : undefined"
              >
                <UIcon :name="item.icon" class="nav-ico" />
                <span v-if="!collapsed" class="nav-label">{{ item.label }}</span>
              </NuxtLink>
            </UTooltip>
            <!-- Estrella para fijar/quitar de favoritos (solo expandido) -->
            <button
              v-if="!collapsed"
              type="button"
              class="fav-toggle"
              :class="{ 'is-on': isFavorite(item.id) }"
              :aria-label="isFavorite(item.id) ? `Quitar ${item.label} de favoritos` : `Fijar ${item.label} en favoritos`"
              :aria-pressed="isFavorite(item.id)"
              @click="toggleFav(item.id)"
            >
              <UIcon :name="isFavorite(item.id) ? 'i-lucide-star' : 'i-lucide-star'" class="fav-toggle-ico" />
            </button>
          </li>
        </ul>
      </div>

      <p v-if="noResults" class="nav-empty">Sin resultados para “{{ query }}”.</p>
    </nav>

    <!-- 5 · Ajustes (fijo abajo) -->
    <div class="sidebar-foot">
      <UTooltip
        text="Ajustes"
        :disabled="!collapsed"
        :content="{ side: 'right', sideOffset: 8 }"
      >
        <NuxtLink
          to="/app/ajustes"
          class="nav-item foot-link"
          :class="{ 'is-active': route.path.startsWith('/app/ajustes') }"
        >
          <UIcon name="i-lucide-settings" class="nav-ico" />
          <span v-if="!collapsed" class="nav-label">Ajustes</span>
        </NuxtLink>
      </UTooltip>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: fixed;
  inset-block: 0; left: 0;
  width: 256px;
  z-index: 40;
  flex-direction: column;
  /* Superficie elevada: blanco puro + borde definido + sombra hacia el contenido
     crema, para que el shell NO se funda con la vista. */
  background: var(--pure-white);
  border-right: 1px solid var(--border);
  box-shadow: 4px 0 24px rgba(26, 26, 26, 0.035);
  transition: width var(--dur) var(--ease-standard);
}
.sidebar.is-collapsed { width: 76px; }

/* ── 1 · Marca + toggle ── */
.brand-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  height: 56px;
  padding: 0 14px 0 20px;
  flex-shrink: 0;
}
.brand-bar.is-collapsed { justify-content: center; padding: 0; }
.brand { display: flex; align-items: center; text-decoration: none; min-width: 0; }
.brand-logo { height: 20px; width: auto; display: block; }

.collapse-btn {
  width: 34px; height: 34px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 9px;
  background: transparent; border: none;
  color: var(--fg3); cursor: pointer;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.collapse-btn:hover { background: var(--crema-100); color: var(--fg1); }
.collapse-btn:focus-visible { outline: 2px solid var(--terracotta); outline-offset: 1px; }
.collapse-ico { width: 18px; height: 18px; }

/* ── 2 · Cuenta (arriba) ── */
.acct-wrap { padding: 0 12px 12px; flex-shrink: 0; }
.acct-wrap.is-collapsed { padding: 0 0 12px; }
.account {
  width: 100%;
  display: flex; align-items: center; gap: 10px;
  padding: 8px;
  border-radius: 12px;
  background: transparent; border: 1px solid transparent;
  cursor: pointer; text-align: left;
  transition: background var(--dur) var(--ease-standard), border-color var(--dur) var(--ease-standard);
}
.account.is-collapsed { justify-content: center; padding: 6px; }
.account:hover { background: var(--crema-100); border-color: var(--border-subtle); }
.account:focus-visible { outline: 2px solid var(--terracotta); outline-offset: 1px; }
.avatar {
  width: 38px; height: 38px; border-radius: 50%;
  background: var(--terracotta); color: var(--crema-100);
  font-size: 13px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.account-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.account-name {
  font-size: 13.5px; font-weight: 600; color: var(--fg1);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.account-role { font-size: 11.5px; color: var(--fg3); }
.account-caret { width: 16px; height: 16px; color: var(--fg3); flex-shrink: 0; }

/* ── 3 · Buscador ── */
.search {
  position: relative;
  margin: 0 12px 12px;
  flex-shrink: 0;
}
.search-ico {
  position: absolute; left: 11px; top: 50%; transform: translateY(-50%);
  width: 15px; height: 15px; color: var(--fg3); pointer-events: none;
}
.search-input {
  width: 100%;
  height: 36px;
  padding: 0 12px 0 33px;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
  background: var(--crema-50);
  font-size: 13px; color: var(--fg1);
  transition: border-color var(--dur) var(--ease-standard), background var(--dur) var(--ease-standard);
}
.search-input::placeholder { color: var(--fg3); }
.search-input:focus { outline: none; border-color: var(--terracotta-300); background: var(--pure-white); }
.search-input::-webkit-search-cancel-button { cursor: pointer; }

/* ── 4 · Navegación ── */
.nav-scroll {
  flex: 1;
  overflow-y: auto; overflow-x: hidden;
  padding: 4px 12px 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.sidebar.is-collapsed .nav-scroll { padding: 4px 14px 12px; }
.nav-section + .nav-section { margin-top: 16px; }
.nav-section-label {
  margin: 0;
  padding: 4px 12px 8px;
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.07em; text-transform: uppercase;
  color: var(--fg3);
}
.nav-section-divider {
  display: block; height: 1px; margin: 0 6px 10px; background: var(--border-subtle);
}
.nav-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }

.nav-row { position: relative; }
.nav-item {
  position: relative;
  display: flex; align-items: center; gap: 12px;
  padding: 9px 12px;
  border-radius: 9px;
  font-size: 14px; font-weight: 500;
  color: var(--fg2);
  text-decoration: none;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.sidebar.is-collapsed .nav-item { justify-content: center; padding: 10px; }
.nav-item:hover { background: var(--crema-100); color: var(--fg1); }
.nav-item:focus-visible { outline: 2px solid var(--terracotta); outline-offset: 1px; }

.nav-item.is-active { background: var(--crema-200); color: var(--fg1); font-weight: 600; }
.nav-item.is-active::before {
  content: '';
  position: absolute; left: -12px; top: 50%; transform: translateY(-50%);
  width: 3px; height: 20px; border-radius: 0 3px 3px 0; background: var(--terracotta);
}
.sidebar.is-collapsed .nav-item.is-active::before { left: -14px; }
.nav-item.is-active .nav-ico { color: var(--terracotta-700); }

.nav-ico { width: 19px; height: 19px; flex-shrink: 0; color: var(--fg3); }
.nav-item:hover .nav-ico { color: var(--fg2); }
.nav-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-item.is-brand .nav-ico { color: var(--terracotta); }

/* Estrella de favorito — aparece al hover de la fila */
.fav-toggle {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  width: 26px; height: 26px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: 7px;
  background: transparent; color: var(--fg3);
  cursor: pointer; opacity: 0;
  transition: opacity var(--dur) var(--ease-standard), background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.nav-row:hover .fav-toggle, .fav-toggle:focus-visible { opacity: 1; }
.fav-toggle.is-on { opacity: 1; color: #d8a441; }
.fav-toggle:hover { background: var(--crema-200); color: #d8a441; }
.fav-toggle:focus-visible { outline: 2px solid var(--terracotta); outline-offset: 1px; }
.fav-toggle-ico { width: 15px; height: 15px; }
.fav-toggle.is-on .fav-toggle-ico { fill: currentColor; }

/* Cabecera colapsable de Favoritos */
.fav-head {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 12px 8px;
  background: transparent; border: none; cursor: pointer;
  font-size: 11px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase;
  color: var(--fg3);
}
.fav-head:hover { color: var(--fg2); }
.fav-head:focus-visible { outline: 2px solid var(--terracotta); outline-offset: 1px; border-radius: 6px; }
.fav-caret { width: 14px; height: 14px; transition: transform var(--dur) var(--ease-standard); }
.fav-caret.is-closed { transform: rotate(-90deg); }
.fav-dot { width: 9px; height: 9px; border-radius: 3px; flex-shrink: 0; margin: 0 5px; }

.nav-empty { padding: 12px; font-size: 13px; color: var(--fg3); }

/* ── 5 · Ajustes (pie) ── */
.sidebar-foot {
  flex-shrink: 0;
  padding: 12px;
  border-top: 1px solid var(--border-subtle);
}
.foot-link { font-weight: 500; }
</style>
