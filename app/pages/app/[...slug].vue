<script setup lang="ts">
definePageMeta({ layout: 'app' })

interface UpcomingScreen {
  title: string
  sub: string
  icon: string
  epic: string
}

// Mapa de módulos del backlog (frontend_context.md §8) aún no construidos
const SCREENS: Record<string, UpcomingScreen> = {
  pos: { title: 'Mesas y salón', sub: 'POS, comandas y cocina', icon: 'i-lucide-utensils', epic: 'Sprint 2 · E03' },
  stock: { title: 'Inventario', sub: 'Stock, movimientos y conteos', icon: 'i-lucide-package', epic: 'Sprint 3 · E05' },
  chat: { title: 'Chat analítico', sub: 'Pregúntale a tus ventas en español', icon: 'i-lucide-bot', epic: 'Sprint 5 · E09' },
  recipes: { title: 'Recetas', sub: 'Catálogo, costos y márgenes', icon: 'i-lucide-utensils', epic: 'Sprint 1 · E02' },
  invoices: { title: 'Comprobantes', sub: 'Ventas y tickets emitidos', icon: 'i-lucide-receipt', epic: 'Sprint 2 · E04' },
  data: { title: 'Datos', sub: 'Importación y exportación', icon: 'i-lucide-upload', epic: 'Sprint 1 · E11' },
  settings: { title: 'Ajustes del negocio', sub: 'Horarios, mesas, impuestos, pagos', icon: 'i-lucide-settings', epic: 'Sprint 1 · E01' },
  profile: { title: 'Perfil', sub: 'Tus datos y preferencias', icon: 'i-lucide-user', epic: 'Sprint 1 · E01' },
  help: { title: 'Ayuda', sub: 'Centro de soporte', icon: 'i-lucide-circle-help', epic: 'Sprint 4' },
}

const route = useRoute()

const screen = computed<UpcomingScreen>(() => {
  const [head] = (route.params.slug as string[] | undefined) ?? []
  return (head && SCREENS[head]) || {
    title: 'Pantalla en construcción',
    sub: 'Este módulo llega en un próximo sprint',
    icon: 'i-lucide-hammer',
    epic: 'Backlog',
  }
})

useSeoMeta({ title: () => `${screen.value.title} — GastronomIA` })
</script>

<template>
  <div class="wip">
    <div class="wip-card">
      <span class="wip-ico" aria-hidden="true"><UIcon :name="screen.icon" /></span>
      <span class="wip-epic">{{ screen.epic }}</span>
      <h1 class="wip-title">{{ screen.title }}</h1>
      <p class="wip-sub">{{ screen.sub }}</p>
      <p class="wip-note">
        Esta pantalla ya está diseñada en el prototipo y se construye
        siguiendo el orden del backlog.
      </p>
      <UButton to="/app" variant="outline" color="neutral" icon="i-lucide-arrow-left" class="mt-4">
        Volver al inicio
      </UButton>
    </div>
  </div>
</template>

<style scoped>
.wip {
  min-height: 70dvh;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.wip-card {
  display: flex; flex-direction: column; align-items: center;
  text-align: center;
  max-width: 360px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 32px 24px;
  box-shadow: var(--shadow-sm);
}
.wip-ico {
  width: 52px; height: 52px; border-radius: 14px;
  background: var(--terracotta-100); color: var(--terracotta-700);
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 14px;
}
.wip-ico .iconify { width: 26px; height: 26px; }
.wip-epic {
  font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--mostaza-700);
}
.wip-title {
  font-family: var(--font-serif);
  font-style: italic; font-weight: 500;
  font-size: 26px; line-height: 1.2;
  color: var(--fg1);
  margin: 6px 0 0;
}
.wip-sub { font-size: 14px; color: var(--fg2); margin: 6px 0 0; }
.wip-note { font-size: 12.5px; color: var(--fg3); margin: 12px 0 0; line-height: 1.5; }
</style>
