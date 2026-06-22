<script setup lang="ts">
useSeoMeta({ title: 'Recuperar contraseña — GastronomIA' })

const email = ref('')
const sent = ref(false)
</script>

<template>
  <div class="forgot-screen">
    <header class="forgot-hdr">
      <UButton
        to="/ingresar"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        aria-label="Volver a iniciar sesión"
      />
    </header>

    <div class="forgot-body">
      <h1 class="forgot-title">Recupera tu contraseña</h1>
      <p class="forgot-sub">
        Te enviaremos un enlace para restablecerla.
      </p>

      <template v-if="!sent">
        <UFormField label="Email" class="mt-6">
          <UInput
            v-model="email"
            type="email"
            size="xl"
            icon="i-lucide-mail"
            placeholder="tu@correo.com"
            autocomplete="email"
            class="w-full"
          />
        </UFormField>
        <UButton size="xl" block class="mt-4" :disabled="!email" @click="sent = true">
          Enviar enlace
        </UButton>
      </template>

      <UAlert
        v-else
        color="success"
        variant="subtle"
        icon="i-lucide-mail-check"
        title="Revisa tu bandeja"
        description="Si el email existe, recibirás un enlace en unos minutos. (Disponible con la API en Sprint 1)"
        class="mt-6"
      />
    </div>
  </div>
</template>

<style scoped>
.forgot-screen {
  min-height: 100dvh;
  display: flex; flex-direction: column;
  background: var(--crema);
}
.forgot-hdr {
  display: flex; align-items: center;
  height: 48px; padding: 8px;
  padding-top: calc(8px + env(safe-area-inset-top, 0px));
}
.forgot-body {
  width: 100%; max-width: 420px;
  margin: 0 auto;
  padding: 8px 24px 24px;
}
.forgot-title {
  margin: 0;
  font-weight: 600; font-size: 26px; line-height: 1.15;
  letter-spacing: -0.02em;
  color: var(--fg1);
}
.forgot-sub { margin: 6px 0 0; font-size: 13.5px; color: var(--fg2); }
</style>
