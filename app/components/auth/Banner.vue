<script setup lang="ts">
// Banner editorial de autenticación. Jerarquía por DOS VOCES tipográficas y TONO
// cálido sólido (nunca opacidad sobre color, que vira a gris): "Tu cocina," en
// Lora itálica lino cálido + remate Geist bold crema-blanco, subrayado por una
// pincelada SVG artesanal que dialoga con el watercolor. Marca de agua del lente
// del logo para profundidad. Imagen de fondo en /img/auth-banner.webp.
withDefaults(
  defineProps<{
    eyebrow?: string
    titleLead?: string
    titleAccent?: string
    lead?: string
    compact?: boolean
  }>(),
  {
    eyebrow: 'Para quienes cocinan con la cuenta clara',
    titleLead: 'Tu cocina,',
    titleAccent: 'en números claros.',
    lead: 'Sabé cuánto deja cada plato, controlá tu stock y anticipá la demanda. Sin pelear con planillas.',
    compact: false,
  },
)
</script>

<template>
  <aside class="auth-banner" :class="{ 'is-compact': compact }" aria-hidden="true">
    <div class="auth-banner__photo" />
    <div class="auth-banner__scrim" />

    <svg class="auth-banner__watermark" viewBox="0 0 200 200" fill="none" aria-hidden="true" focusable="false">
      <path d="M100 18c-45 0-82 37-82 82 0 33 19 61 47 75 7-31 30-57 60-69 19-25 22-58 8-88-9-1-22-0-33 0Z"
            stroke="var(--crema-50)" stroke-width="3" opacity="0.9" />
      <path d="M118 70c-26 6-44 30-44 58 0 8 1 15 4 22 5-26 24-47 49-55 1-9 0-18-9-25Z"
            stroke="var(--crema-50)" stroke-width="2.4" opacity="0.7" />
    </svg>

    <div class="auth-banner__top">
      <img src="/img/gastronomia-logo-light.svg" alt="GastronomIA" class="auth-banner__logo">
    </div>

    <div class="auth-banner__mid">
      <p class="auth-banner__eyebrow">{{ eyebrow }}</p>
      <h2 class="auth-banner__title">
        <span class="auth-banner__title-lead">{{ titleLead }}</span>
        <span class="auth-banner__title-key">
          {{ titleAccent }}
          <svg class="auth-banner__brush" viewBox="0 0 320 26" fill="none" aria-hidden="true" focusable="false">
            <path d="M5 17.5C42 9.5 96 7 142 9.2c40 1.9 78 6.4 118 4.1 18-1 35-3.4 52-7.8"
                  stroke="var(--terracotta)" stroke-width="7" stroke-linecap="round" opacity="0.32" />
            <path d="M7 15.2C50 8.8 104 12 150 11c44-1 80 3.6 121 1.4 16-.9 30-2.6 41-5.2"
                  stroke="var(--terracotta-300)" stroke-width="3.4" stroke-linecap="round" opacity="0.85" />
            <path d="M250 9.6c14 .4 30 .1 44-2.2" stroke="var(--terracotta)" stroke-width="2"
                  stroke-linecap="round" opacity="0.5" />
          </svg>
        </span>
      </h2>

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
  color: var(--crema-50);
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

/* Scrim anclado a la izquierda + capa radial terracota tenue: la zona del texto
   queda oscuro CÁLIDO (coherente con el agua), no gris neutro. */
.auth-banner__scrim {
  position: absolute;
  inset: 0;
  z-index: 1;
  background:
    linear-gradient(90deg, rgba(20, 12, 8, 0.84) 0%, rgba(20, 12, 8, 0.55) 38%, rgba(20, 12, 8, 0.10) 70%, transparent 100%),
    linear-gradient(180deg, rgba(20, 12, 8, 0.40) 0%, transparent 34%, rgba(20, 12, 8, 0.32) 100%),
    radial-gradient(120% 90% at 8% 60%, rgba(90, 47, 29, 0.30) 0%, transparent 60%);
  pointer-events: none;
}

/* Marca de agua: el lente del logo, gigante y tenue, da profundidad editorial. */
.auth-banner__watermark {
  position: absolute;
  z-index: 1;
  right: -36px;
  bottom: -28px;
  width: 320px;
  height: 320px;
  opacity: 0.06;
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
  max-width: 28rem;
}
/* Eyebrow en TONO cálido sólido (taupe), no opacidad-gris. Sin color de acento. */
.auth-banner__eyebrow {
  display: block;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #c9b49e;
  margin: 0 0 22px;
}
.auth-banner__title {
  margin: 0;
  letter-spacing: -0.02em;
  max-width: 13em;
}
/* Setup en Lora itálica (serif de marca) + crema lino cálido SÓLIDO. Voz íntima. */
.auth-banner__title-lead {
  display: block;
  font-family: var(--font-serif);
  font-style: italic;
  font-size: clamp(26px, 2.6vw, 34px);
  font-weight: 400;
  line-height: 1.12;
  color: #e7d8c4;
}
/* Remate en Geist 700, crema-blanco pleno y grande. Jerarquía por peso+tamaño+familia. */
.auth-banner__title-key {
  display: block;
  position: relative;
  width: fit-content;
  margin-top: 6px;
  font-family: var(--font-display);
  font-size: clamp(44px, 4.8vw, 60px);
  font-weight: 700;
  line-height: 1.04;
  letter-spacing: -0.03em;
  color: var(--crema-50);
}
/* Pincelada artesanal que subraya el remate y dialoga con el watercolor. NO dash. */
.auth-banner__brush {
  position: absolute;
  left: 0;
  bottom: -0.42em;
  width: 88%;
  height: auto;
  pointer-events: none;
}
/* Subtítulo: crema cálido SÓLIDO. Separado por espacio (sin barra de acento). */
.auth-banner__lead {
  margin: 38px 0 0;
  max-width: 24rem;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.6;
  color: #e6d9c8;
}

/* Variante compacta para el registro: mismo sistema, escala menor */
.auth-banner.is-compact .auth-banner__title-key { font-size: clamp(38px, 3.8vw, 50px); }
.auth-banner.is-compact .auth-banner__title-lead { font-size: clamp(23px, 2.4vw, 29px); }

@media (prefers-reduced-motion: reduce) {
  .auth-banner * { transition: none; }
}
</style>
