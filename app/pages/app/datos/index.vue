<script setup lang="ts">
// QA-13: `/app/datos` era una ruta huérfana — no existe un `index.vue` real
// bajo `app/datos/`, solo sus hijos (`importar`, `importar-carta`, `exportar`,
// `factura-ia`), así que cualquier link viejo o bookmark a `/app/datos` caía
// en un 404. El hub real de "Datos" vive en `/app/menu` (sección DATOS del
// sidebar/menú móvil: Importar carta con IA, Importar historial, Exportar).
// Redirigimos ahí en vez de duplicar esa lista en una pantalla nueva.
definePageMeta({
  layout: 'app',
  redirect: '/app/menu',
})
</script>

<template>
  <div />
</template>
