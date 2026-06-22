<script setup lang="ts">
const { collapsed } = useSidebar()
</script>

<template>
  <div class="min-h-dvh">
    <NavDesktopSidebar />
    <main class="app-main" :class="{ 'is-collapsed': collapsed }">
      <NavAppTopbar />
      <!-- Acciones contextuales de la página: las vistas teleportan acá (debajo del
           topbar global). Se oculta sola cuando la vista no declara acciones. -->
      <div id="topbar-actions" class="page-toolbar" />
      <slot />
    </main>
    <NavMobileTabBar />
  </div>
</template>

<style scoped>
.app-main {
  /* aire para el tab bar móvil + safe area iPhone */
  padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px));
}
@media (min-width: 1024px) {
  .app-main {
    margin-left: 256px;
    padding-bottom: 32px;
    transition: margin-left var(--dur) var(--ease-standard);
  }
  .app-main.is-collapsed { margin-left: 76px; }
}

/* Toolbar de acciones contextuales, debajo del topbar global */
.page-toolbar:empty { display: none; }
.page-toolbar {
  display: flex; align-items: center; justify-content: flex-end;
  flex-wrap: wrap; gap: 8px;
  padding: 14px clamp(20px, 2.6vw, 38px) 0;
}
</style>
