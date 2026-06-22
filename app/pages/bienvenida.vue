<script setup lang="ts">
useSeoMeta({ title: 'Bienvenido — GastronomIA' })
</script>

<template>
  <div class="wl-screen">
    <div class="wl-atmo" aria-hidden="true" />

    <main class="wl-body">
      <img src="/img/gastronomia-logo.svg" alt="GastronomIA" class="wl-brand">
      <h1 class="wl-title display">Tu restaurante,<br>rentable.</h1>
      <p class="wl-sub">
        Costea cada plato, anticipa tu demanda y pregúntale a tus
        ventas en español. Todo desde tu celular.
      </p>

      <ul class="wl-feats" aria-label="Lo que obtienes">
        <li><UIcon name="i-lucide-calculator" /> Costos y márgenes al céntimo</li>
        <li><UIcon name="i-lucide-trending-up" /> Forecast de demanda con IA</li>
        <li><UIcon name="i-lucide-bot" /> Chat analítico en español</li>
      </ul>
    </main>

    <footer class="wl-cta">
      <UButton to="/registro" size="xl" block trailing-icon="i-lucide-arrow-right">
        Crear cuenta gratis
      </UButton>
      <UButton to="/ingresar" size="xl" block color="neutral" variant="ghost">
        Ya tengo cuenta
      </UButton>
      <p class="wl-legal">Al continuar aceptas los <NuxtLink to="/bienvenida">Términos</NuxtLink> y la <NuxtLink to="/bienvenida">Privacidad</NuxtLink>.</p>
    </footer>
  </div>
</template>

<style scoped>
.wl-screen {
  position: relative;
  min-height: 100dvh;
  display: flex; flex-direction: column;
  background: var(--crema);
  overflow: hidden;
}
.wl-atmo {
  position: absolute; inset: 0;
  background:
    radial-gradient(640px 420px at 80% -5%, rgba(201, 106, 67, 0.16), transparent 60%),
    radial-gradient(480px 360px at -10% 70%, rgba(216, 164, 65, 0.12), transparent 60%);
  pointer-events: none;
}
.wl-body {
  position: relative;
  flex: 1;
  width: 100%; max-width: 440px;
  margin: 0 auto;
  padding: calc(56px + env(safe-area-inset-top, 0px)) 28px 16px;
  display: flex; flex-direction: column;
}
.wl-brand {
  height: 34px; width: auto; display: block;
  margin-bottom: 26px;
}
.wl-title { font-size: clamp(40px, 11vw, 52px); margin: 0; }
.wl-sub {
  font-size: 15px; line-height: 1.6; color: var(--fg2);
  margin: 14px 0 0;
  max-width: 28em;
  text-wrap: pretty;
}
.wl-feats {
  list-style: none;
  padding: 0;
  margin: 28px 0 0;
  display: flex; flex-direction: column; gap: 10px;
}
.wl-feats li {
  display: flex; align-items: center; gap: 10px;
  font-size: 14px; font-weight: 500; color: var(--fg1);
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 11px 14px;
}
.wl-feats .iconify { width: 18px; height: 18px; color: var(--terracotta); flex-shrink: 0; }
.wl-cta {
  position: relative;
  width: 100%; max-width: 440px;
  margin: 0 auto;
  padding: 8px 28px calc(18px + env(safe-area-inset-bottom, 0px));
  display: flex; flex-direction: column; gap: 8px;
}
.wl-legal {
  text-align: center;
  font-size: 11px; color: var(--fg3);
  margin: 8px 0 0;
}
.wl-legal a { color: var(--fg2); }
</style>
