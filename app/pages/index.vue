<script setup lang="ts">
const { loggedIn } = useUserSession()

useSeoMeta({
  title: 'GastronomIA — Tu restaurante, rentable',
  description: 'Forecasting de demanda, costeo por plato y chat analítico con IA para restaurantes PyME.',
})
</script>

<template>
  <div class="landing">
    <header class="landing-hdr">
      <div class="brand">
        <img src="/img/gastronomia-logo.svg" alt="GastronomIA" class="brand-logo">
      </div>
      <UButton
        :to="loggedIn ? '/app' : '/ingresar'"
        color="neutral"
        variant="outline"
        size="sm"
      >
        {{ loggedIn ? 'Ir al panel' : 'Iniciar sesión' }}
      </UButton>
    </header>

    <main class="hero">
      <p class="eyebrow">Rentabilidad con IA para restaurantes</p>
      <h1 class="display hero-title">
        Tu restaurante,<br>rentable.
      </h1>
      <p class="hero-sub">
        Pronostica tu demanda, costea cada plato al céntimo y pregúntale
        a tus ventas en español. Hecho para PyMEs gastronómicas del Perú.
      </p>
      <div class="hero-cta">
        <UButton :to="loggedIn ? '/app' : '/ingresar'" size="xl" trailing-icon="i-lucide-arrow-right">
          {{ loggedIn ? 'Ir al panel' : 'Empezar' }}
        </UButton>
      </div>

      <ul class="hero-pillars" aria-label="Pilares del producto">
        <li>
          <UIcon name="i-lucide-trending-up" class="pillar-ico" />
          <b>Forecast de demanda</b>
          <span>Predicciones con bandas de confianza para comprar justo lo necesario.</span>
        </li>
        <li>
          <UIcon name="i-lucide-calculator" class="pillar-ico" />
          <b>Costeo por plato</b>
          <span>Recetas, mermas y márgenes recalculados con cada compra.</span>
        </li>
        <li>
          <UIcon name="i-lucide-bot" class="pillar-ico" />
          <b>Chat analítico</b>
          <span>"¿Qué plato me dejó más margen esta semana?" — respondido al instante.</span>
        </li>
      </ul>
    </main>

    <footer class="landing-foot">
      <span>v0.1.0 · Hecho con <span class="heart">♥</span> en Lima, Perú</span>
    </footer>
  </div>
</template>

<style scoped>
.landing {
  min-height: 100dvh;
  display: flex; flex-direction: column;
  background:
    radial-gradient(900px 600px at 85% -10%, rgba(201, 106, 67, 0.12), transparent 60%),
    radial-gradient(700px 500px at -10% 90%, rgba(216, 164, 65, 0.10), transparent 60%),
    var(--crema);
}
.landing-hdr {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  max-width: 1080px; width: 100%; margin: 0 auto;
}
.brand { display: flex; align-items: center; }
.brand-logo { height: 20px; width: auto; display: block; }

.hero {
  flex: 1;
  max-width: 1080px; width: 100%; margin: 0 auto;
  padding: 48px 24px 32px;
  display: flex; flex-direction: column;
}
.hero-title { font-size: clamp(44px, 8vw, 76px); margin: 14px 0 0; }
.hero-sub {
  margin-top: 18px;
  font-size: 17px; line-height: 1.6; color: var(--fg2);
  max-width: 30em;
  text-wrap: pretty;
}
.hero-cta { margin-top: 28px; }

.hero-pillars {
  list-style: none; padding: 0;
  margin-top: 56px;
  display: grid; gap: 14px;
  grid-template-columns: 1fr;
}
@media (min-width: 768px) {
  .hero-pillars { grid-template-columns: repeat(3, 1fr); }
}
.hero-pillars li {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 18px;
  display: flex; flex-direction: column; gap: 6px;
  box-shadow: var(--shadow-xs);
}
.pillar-ico { width: 22px; height: 22px; color: var(--terracotta); margin-bottom: 4px; }
.hero-pillars b { font-size: 15px; color: var(--fg1); }
.hero-pillars span { font-size: 13.5px; line-height: 1.5; color: var(--fg2); }

.landing-foot {
  padding: 20px;
  text-align: center;
  font-size: 12px; color: var(--fg3);
}
.heart { color: var(--terracotta); }
</style>
