<script setup lang="ts">
// Banner editorial de autenticación, tratamiento tipográfico estilo Cupazo:
// headline sans bold con una palabra de acento, barra corta, subtítulo, body,
// y wordmark fantasma gigante de fondo. Sin lista de features (cliché de IA).
// Imagen en /img/auth-banner.webp; si falta, cae al gradiente base.
withDefaults(
  defineProps<{
    eyebrow?: string
    titleLead?: string
    titleAccent?: string
    lead?: string
    compact?: boolean
  }>(),
  {
    eyebrow: 'Para restaurantes que cuidan su margen',
    titleLead: 'Tu cocina, en números',
    titleAccent: 'claros.',
    lead: 'Sabé cuánto deja cada plato, controlá tu stock y anticipá la demanda. Sin pelear con planillas.',
    compact: false,
  },
)
</script>

<template>
  <aside class="auth-banner" :class="{ 'is-compact': compact }" aria-hidden="true">
    <div class="auth-banner__photo" />
    <div class="auth-banner__scrim" />

    <div class="auth-banner__top">
      <img src="/img/gastronomia-logo-light.svg" alt="GastronomIA" class="auth-banner__logo">
    </div>

    <div class="auth-banner__mid">
      <p class="auth-banner__eyebrow">{{ eyebrow }}</p>
      <h2 class="auth-banner__title">
        {{ titleLead }} <span class="auth-banner__accent">{{ titleAccent }}</span>
      </h2>
      <span class="auth-banner__rule" />

      <p v-if="!compact" class="auth-banner__lead">{{ lead }}</p>
    </div>
  </aside>
</template>

<style scoped>
.auth-banner {
  display: none;
  position: relative;
  overflow: hidden;
  padding: 48px 52px;
  flex-direction: column;
  color: var(--crema-100);
  background: linear-gradient(155deg, #241d19 0%, #3a261d 52%, #5a2f1d 100%);
}
@media (min-width: 900px) {
  .auth-banner { display: flex; }
}

.auth-banner__photo {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-image: url('/img/auth-banner.webp');
  background-size: cover;
  background-position: center;
  pointer-events: none;
}

/* Scrim anclado a la izquierda: el headline bold blanco se recorta sobre la
   zona oscura, el watercolor respira a la derecha. */
.auth-banner__scrim {
  position: absolute;
  inset: 0;
  z-index: 1;
  background:
    linear-gradient(90deg, rgba(16, 11, 9, 0.82) 0%, rgba(16, 11, 9, 0.52) 38%, rgba(16, 11, 9, 0.08) 70%, transparent 100%),
    linear-gradient(180deg, rgba(16, 11, 9, 0.42) 0%, transparent 32%, rgba(16, 11, 9, 0.34) 100%);
  pointer-events: none;
}

.auth-banner__top,
.auth-banner__mid {
  position: relative;
  z-index: 3;
}

.auth-banner__logo {
  height: 26px;
  width: auto;
  display: block;
}

.auth-banner__mid {
  margin-top: auto;
  margin-bottom: auto;
  max-width: 27rem;
}
.auth-banner__eyebrow {
  display: block;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--terracotta-300);
  margin: 0 0 18px;
}
.auth-banner__title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(40px, 4.4vw, 54px);
  line-height: 1.06;
  letter-spacing: -0.025em;
  margin: 0;
  max-width: 8em;
  color: var(--crema-50);
}
/* Acento editorial: serif itálica de marca (Lora) que rompe el bloque sans —
   firma de diseño humano, lo opuesto al "todo bold sans" de las landings IA. */
.auth-banner__accent {
  font-family: var(--font-serif);
  font-style: italic;
  font-weight: 500;
  font-size: 1.06em;
  letter-spacing: -0.005em;
  color: var(--mostaza);
}
.auth-banner__rule {
  display: block;
  width: 56px;
  height: 4px;
  border-radius: 999px;
  background: var(--terracotta);
  margin: 26px 0 0;
}
.auth-banner__lead {
  margin: 28px 0 0;
  max-width: 23rem;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.55;
  color: rgba(248, 244, 237, 0.86);
}

/* Variante compacta para el registro: eyebrow + título + barra */
.auth-banner.is-compact .auth-banner__title { font-size: clamp(36px, 3.6vw, 46px); }
</style>
