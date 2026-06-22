<script setup lang="ts">
const { loggedIn } = useUserSession()

useSeoMeta({
  title: 'GastronomIA — Tu restaurante, rentable',
  description:
    'Pronóstico de demanda, costeo por plato y chat analítico para restaurantes PyME del Perú.',
})

const pillars = [
  {
    icon: 'i-lucide-trending-up',
    title: 'Pronóstico de demanda',
    desc: 'Predicciones diarias por plato con banda q10–q90 para comprar justo lo necesario.',
  },
  {
    icon: 'i-lucide-calculator',
    title: 'Costeo por plato',
    desc: 'Recetas, mermas y márgenes recalculados con cada compra. Sabés cuánto deja cada plato.',
  },
  {
    icon: 'i-lucide-message-square-text',
    title: 'Chat analítico',
    desc: 'Preguntá en español —«¿qué plato dejó más margen?»— y obtené la respuesta al instante.',
  },
]
</script>

<template>
  <div class="landing">
    <header class="landing-hdr">
      <img src="/img/gastronomia-logo.svg" alt="GastronomIA" class="brand-logo">
      <UButton
        :to="loggedIn ? '/app' : '/ingresar'"
        color="neutral"
        variant="ghost"
        size="sm"
      >
        {{ loggedIn ? 'Ir al panel' : 'Iniciar sesión' }}
      </UButton>
    </header>

    <main class="hero">
      <p class="eyebrow">Rentabilidad con IA · Restaurantes PyME</p>
      <h1 class="display hero-title">Tu restaurante, rentable.</h1>
      <p class="hero-sub">
        Pronosticá la demanda, costeá cada plato al céntimo y preguntale a tus
        ventas en español.
      </p>
      <div class="hero-cta">
        <UButton
          :to="loggedIn ? '/app' : '/ingresar'"
          size="lg"
          trailing-icon="i-lucide-arrow-right"
        >
          {{ loggedIn ? 'Ir al panel' : 'Empezar' }}
        </UButton>
      </div>

      <ul class="pillars" aria-label="Qué hace GastronomIA">
        <li v-for="p in pillars" :key="p.title" class="pillar">
          <UIcon :name="p.icon" class="pillar-ico" />
          <h2 class="pillar-title">{{ p.title }}</h2>
          <p class="pillar-desc">{{ p.desc }}</p>
        </li>
      </ul>
    </main>

    <footer class="landing-foot">Lima · Perú</footer>
  </div>
</template>

<style scoped>
.landing {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(800px 420px at 88% -8%, rgba(201, 106, 67, 0.07), transparent 70%),
    var(--crema-50);
}

.landing-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  padding: 22px 24px;
}
.brand-logo {
  height: 20px;
  width: auto;
  display: block;
}

.hero {
  flex: 1;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  padding: clamp(40px, 9vh, 96px) 24px 40px;
  display: flex;
  flex-direction: column;
}
.hero-title {
  font-size: clamp(46px, 8.5vw, 92px);
  margin: 16px 0 0;
  max-width: 12ch;
}
.hero-sub {
  margin-top: 22px;
  font-size: clamp(17px, 2.2vw, 20px);
  line-height: 1.55;
  color: var(--fg2);
  max-width: 34ch;
  text-wrap: pretty;
}
.hero-cta {
  margin-top: 32px;
}

.pillars {
  list-style: none;
  padding: 0;
  margin: clamp(56px, 12vh, 104px) 0 0;
  display: grid;
  gap: 16px;
  grid-template-columns: 1fr;
}
@media (min-width: 760px) {
  .pillars {
    grid-template-columns: repeat(3, 1fr);
  }
}
.pillar {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pillar-ico {
  width: 20px;
  height: 20px;
  color: var(--terracotta);
  margin-bottom: 6px;
}
.pillar-title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--fg1);
}
.pillar-desc {
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--fg2);
  text-wrap: pretty;
}

.landing-foot {
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  padding: 24px;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--fg3);
}
</style>
