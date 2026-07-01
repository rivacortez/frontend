<script setup lang="ts">
// TODO(E11-magic-upload): deferred — requires Cloudflare R2 + E08 AI service

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Magic Upload — GastronomIA' })
</script>

<template>
  <div class="mu-screen">
    <UiScreenHeader
      title="Magic Upload"
      subtitle="Próximamente"
      back="/app/datos"
    />

    <section class="mu-coming">
      <div class="mu-coming-ico" aria-hidden="true">
        <UIcon name="i-lucide-scan-line" />
      </div>
      <h2 class="mu-coming-title">Magic Upload con IA</h2>
      <p class="mu-coming-desc">
        Próximamente podrás fotografiar una factura de proveedor y la IA extraerá
        automáticamente proveedor, productos y precios para actualizar tu inventario
        y costos sin tipear nada. Esta función requiere la integración con el servicio
        de IA y estará disponible en una próxima actualización.
      </p>
      <NuxtLink to="/app/inventario/stock" class="btn btn-primary btn-lg">
        <UIcon name="i-lucide-package" />
        Subir factura manualmente
      </NuxtLink>
    </section>
  </div>
</template>

<style scoped>
.mu-screen {
  max-width: 560px;
  margin: 0 auto;
  padding-bottom: 40px;
}

.mu-coming {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 32px 28px 0;
  gap: 0;
}

.mu-coming-ico {
  width: 72px;
  height: 72px;
  border-radius: 22px;
  background: var(--crema-200);
  color: var(--terracotta-700);
  border: 1px solid var(--border-subtle);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
}
.mu-coming-ico .iconify {
  width: 32px;
  height: 32px;
}

.mu-coming-title {
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 500;
  font-size: 24px;
  line-height: 1.2;
  color: var(--fg1);
  margin: 0 0 12px;
}

.mu-coming-desc {
  font-size: 14px;
  line-height: 1.55;
  color: var(--fg2);
  margin: 0 0 28px;
  max-width: 380px;
}

.btn-lg {
  min-height: 48px;
  padding: 0 24px;
  font-size: 15px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
}
.btn-lg .iconify {
  width: 18px;
  height: 18px;
}
</style>
