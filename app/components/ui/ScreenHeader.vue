<script setup lang="ts">
// Shim de compatibilidad: ScreenHeader ya no renderiza un header inline. Declara
// el título/subtítulo/"atrás" en la AppTopbar (vía definePageHeader) y teletransporta
// sus acciones (`#trailing`) a la derecha de la topbar. Así todas las subpáginas
// que ya lo usaban migran al shell unificado sin tocarse.
const props = defineProps<{
  title: string
  subtitle?: string
  back?: string
}>()

definePageHeader(() => ({
  title: props.title,
  subtitle: props.subtitle,
  back: props.back,
  hasBack: true,
}))
</script>

<template>
  <ClientOnly>
    <Teleport to="#topbar-actions">
      <slot name="trailing" />
    </Teleport>
  </ClientOnly>
</template>
