<script setup lang="ts">
// Catch-all del área in-app. Todos los módulos del backlog (pos, stock, recetas,
// comprobantes, ajustes, perfil, ayuda, chat, datos, costeo, cocina, migración…)
// YA tienen pantalla real con su propia ruta → este fallback solo cubre rutas
// genuinamente inexistentes (404 dentro de /app), sin prometer "próximamente".
definePageMeta({ layout: 'app' })

const route = useRoute()
const attempted = computed(() => `/app/${((route.params.slug as string[] | undefined) ?? []).join('/')}`)

useSeoMeta({ title: 'Ruta no encontrada — GastronomIA' })

definePageHeader(() => ({ title: 'Ruta no encontrada' }))
</script>

<template>
  <div class="wip">
    <div class="wip-card">
      <span class="wip-ico" aria-hidden="true"><UIcon name="i-lucide-compass" /></span>
      <span class="wip-epic">Error 404</span>
      <h1 class="wip-title">Ruta no encontrada</h1>
      <p class="wip-sub">Este módulo no existe o la dirección es incorrecta.</p>
      <p class="wip-note">
        No encontramos <code class="wip-path">{{ attempted }}</code>.
        Revisa el enlace o vuelve al inicio para seguir navegando.
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
.wip-path {
  font-family: var(--font-mono); font-size: 11.5px;
  background: var(--crema-200); color: var(--fg2);
  padding: 1px 6px; border-radius: 6px;
  word-break: break-all;
}
</style>
