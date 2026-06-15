<script setup lang="ts">
definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Más — GastronomIA' })

const { user, clear } = useUserSession()

interface MenuEntry {
  icon: string
  label: string
  sub: string
  to: string
  soon?: boolean
}

interface MenuGroup {
  title: string
  entries: MenuEntry[]
}

const groups: MenuGroup[] = [
  {
    title: 'Operación',
    entries: [
      { icon: 'i-lucide-chef-hat', label: 'Cocina (KDS)', sub: 'Cola de pedidos en preparación', to: '/app/cocina' },
      { icon: 'i-lucide-utensils', label: 'Recetas', sub: 'Catálogo, costos y márgenes', to: '/app/recipes' },
      { icon: 'i-lucide-package', label: 'Inventario', sub: 'Stock, movimientos y conteos', to: '/app/stock' },
      { icon: 'i-lucide-receipt', label: 'Comprobantes', sub: 'Ventas y tickets emitidos', to: '/app/invoices' },
      { icon: 'i-lucide-bar-chart-3', label: 'Reportes', sub: 'KPIs y análisis semanal', to: '/app/reports' },
    ],
  },
  {
    title: 'Datos',
    entries: [
      { icon: 'i-lucide-upload', label: 'Importar datos', sub: 'CSV desde TumiSoft y otros', to: '/app/data/import' },
      { icon: 'i-lucide-download', label: 'Exportar datos', sub: 'Descarga tus registros', to: '/app/data/export' },
    ],
  },
  {
    title: 'Cuenta',
    entries: [
      { icon: 'i-lucide-user', label: 'Perfil', sub: 'Tus datos y preferencias', to: '/app/profile' },
      { icon: 'i-lucide-settings', label: 'Ajustes del negocio', sub: 'Horarios, mesas, impuestos, pagos', to: '/app/settings' },
      { icon: 'i-lucide-circle-help', label: 'Ayuda', sub: 'Centro de soporte', to: '/app/help' },
    ],
  },
]

async function logout(): Promise<void> {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/login')
}

const initials = computed(() =>
  (user.value?.name ?? '')
    .split(' ')
    .map(part => part[0])
    .slice(0, 2)
    .join(''),
)
</script>

<template>
  <div class="menu-page">
    <header class="menu-hdr">
      <h1 class="menu-title">Más</h1>
    </header>

    <div class="user-card">
      <span class="avatar" aria-hidden="true">{{ initials }}</span>
      <div class="user-meta">
        <span class="user-name">{{ user?.name }}</span>
        <span class="user-sub">{{ user?.email }} · <span class="capitalize">{{ user?.role }}</span></span>
      </div>
    </div>

    <section v-for="group in groups" :key="group.title" class="menu-group">
      <div class="section-eyebrow">{{ group.title }}</div>
      <div class="menu-list">
        <NuxtLink
          v-for="entry in group.entries"
          :key="entry.to"
          :to="entry.to"
          class="menu-item"
        >
          <span class="menu-ico" aria-hidden="true"><UIcon :name="entry.icon" /></span>
          <span class="menu-text">
            <span class="menu-label">{{ entry.label }}</span>
            <span class="menu-sub">{{ entry.sub }}</span>
          </span>
          <span v-if="entry.soon" class="menu-soon">Pronto</span>
          <UIcon name="i-lucide-chevron-right" class="menu-chevron" aria-hidden="true" />
        </NuxtLink>
      </div>
    </section>

    <div class="menu-logout">
      <UButton
        color="error"
        variant="subtle"
        icon="i-lucide-log-out"
        block
        size="lg"
        @click="logout"
      >
        Cerrar sesión
      </UButton>
    </div>
  </div>
</template>

<style scoped>
.menu-page {
  max-width: 560px;
  margin: 0 auto;
  padding: calc(12px + env(safe-area-inset-top, 0px)) 20px 24px;
}
@media (min-width: 1024px) {
  .menu-page { padding-top: 32px; }
}
.menu-hdr { padding: 8px 0 16px; }
.menu-title {
  font-size: 28px; font-weight: 600;
  letter-spacing: -0.02em; line-height: 1.1;
  color: var(--fg1); margin: 0;
}
.user-card {
  display: flex; align-items: center; gap: 12px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 20px;
}
.avatar {
  width: 44px; height: 44px; border-radius: 50%;
  background: var(--terracotta); color: var(--crema-100);
  font-size: 15px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.user-meta { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.user-name { font-size: 15px; font-weight: 600; color: var(--fg1); }
.user-sub {
  font-size: 12.5px; color: var(--fg3);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.menu-group { margin-bottom: 18px; }
.section-eyebrow {
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--fg3);
  padding: 4px 0 10px;
}
.menu-list {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  overflow: hidden;
}
.menu-item {
  display: flex; align-items: center; gap: 12px;
  padding: 13px 14px;
  text-decoration: none;
  transition: background var(--dur) var(--ease-standard);
}
.menu-item + .menu-item { border-top: 1px solid var(--border-subtle); }
.menu-item:hover { background: var(--crema-100); }
.menu-ico {
  width: 36px; height: 36px; border-radius: 10px;
  background: var(--crema-200); color: var(--terracotta-700);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.menu-ico .iconify { width: 18px; height: 18px; }
.menu-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.menu-label { font-size: 14px; font-weight: 600; color: var(--fg1); }
.menu-sub { font-size: 12px; color: var(--fg3); }
.menu-chevron { width: 16px; height: 16px; color: var(--fg3); flex-shrink: 0; }
.menu-soon {
  font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--mostaza-800); background: var(--mostaza-50);
  border: 1px solid var(--mostaza-100);
  padding: 2px 7px; border-radius: 999px; flex-shrink: 0;
}
.menu-logout { margin-top: 8px; }
.capitalize { text-transform: capitalize; }
</style>
