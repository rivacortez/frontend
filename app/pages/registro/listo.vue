<script setup lang="ts">
useSeoMeta({ title: '¡Listo! — GastronomIA' })

const store = useOnboardingStore()
const { fetch: refreshSession } = useUserSession()
const toast = useToast()

if (!store.account.email) {
  await navigateTo('/registro')
}

const registering = ref(false)
const error = ref(false)

async function finish(): Promise<void> {
  if (registering.value) return
  registering.value = true
  error.value = false
  try {
    if (!store.registered) {
      await $fetch('/api/auth/register', {
        method: 'POST',
        body: {
          name: store.account.name,
          email: store.account.email,
          password: store.account.password,
          restaurantName: store.restaurant.name,
        },
      })
      store.registered = true
    }
    await refreshSession()
    await navigateTo('/app')
  }
  catch {
    error.value = true
    toast.add({ title: 'No pudimos crear tu cuenta. Intenta de nuevo.', icon: 'i-lucide-alert-circle', color: 'error' })
  }
  finally {
    registering.value = false
  }
}

const CHECKLIST = computed(() => [
  { label: 'Cuenta verificada', done: true },
  { label: `${store.restaurant.name || 'Tu restaurante'} configurado`, done: true },
  { label: `${store.totalTables} mesas listas para atender`, done: true },
  { label: store.importDone ? 'Importación de datos en cola' : 'Catálogo listo para tus primeras recetas', done: true },
])
</script>

<template>
  <div class="dn-screen">
    <div class="dn-confetti" aria-hidden="true">
      <span v-for="i in 14" :key="i" class="c" :style="{ '--i': i }" />
    </div>

    <main class="dn-body">
      <div class="dn-ico"><UIcon name="i-lucide-party-popper" /></div>
      <h1 class="dn-title display">¡Todo listo, {{ store.firstName }}!</h1>
      <p class="dn-sub">
        <b>{{ store.restaurant.name || 'Tu restaurante' }}</b> ya tiene su centro de
        control de rentabilidad. Esto es lo que dejamos preparado:
      </p>

      <ul class="dn-checks" aria-label="Configuración completada">
        <li v-for="c in CHECKLIST" :key="c.label">
          <UIcon name="i-lucide-check-circle-2" /> {{ c.label }}
        </li>
      </ul>

      <div class="dn-tip">
        <UIcon name="i-lucide-lightbulb" />
        <span><b>Primer paso sugerido:</b> crea tu plato estrella en Recetas y descubre su margen real.</span>
      </div>
    </main>

    <footer class="dn-cta">
      <UButton size="xl" block trailing-icon="i-lucide-arrow-right" :loading="registering" @click="finish">
        Ir a mi panel
      </UButton>
    </footer>
  </div>
</template>

<style scoped>
.dn-screen {
  position: relative;
  min-height: 100dvh;
  display: flex; flex-direction: column;
  background: var(--crema);
  overflow: hidden;
}
.dn-confetti { position: absolute; inset: 0; pointer-events: none; }
.dn-confetti .c {
  position: absolute;
  top: -12px;
  left: calc(var(--i) * 7%);
  width: 8px; height: 12px;
  border-radius: 2px;
  background: var(--terracotta);
  opacity: 0.85;
  animation: dnFall 3.2s linear infinite;
  animation-delay: calc(var(--i) * -0.37s);
}
.dn-confetti .c:nth-child(3n) { background: var(--mostaza); width: 6px; height: 10px; }
.dn-confetti .c:nth-child(4n) { background: var(--oliva); }
.dn-confetti .c:nth-child(5n) { background: var(--terracotta-300); }
@keyframes dnFall {
  0% { transform: translateY(-10px) rotate(0deg); }
  100% { transform: translateY(105vh) rotate(540deg); }
}

.dn-body {
  flex: 1;
  width: 100%; max-width: 440px;
  margin: 0 auto;
  padding: calc(64px + env(safe-area-inset-top, 0px)) 28px 16px;
  display: flex; flex-direction: column;
}
.dn-ico {
  width: 72px; height: 72px; border-radius: 22px;
  background: var(--terracotta); color: var(--crema-100);
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 18px;
  box-shadow: 0 12px 28px rgba(201, 106, 67, 0.35);
  animation: dnPop 420ms var(--ease-emphasis);
}
@keyframes dnPop {
  from { transform: scale(0.4) rotate(-12deg); opacity: 0; }
  to { transform: scale(1) rotate(0); opacity: 1; }
}
.dn-ico .iconify { width: 34px; height: 34px; }
.dn-title { font-size: clamp(34px, 9vw, 44px); margin: 0; }
.dn-sub { font-size: 14.5px; line-height: 1.6; color: var(--fg2); margin: 12px 0 0; }
.dn-sub b { color: var(--fg1); }

.dn-checks {
  list-style: none;
  padding: 0;
  margin: 24px 0 0;
  display: flex; flex-direction: column; gap: 9px;
}
.dn-checks li {
  display: flex; align-items: center; gap: 10px;
  font-size: 14px; font-weight: 500; color: var(--fg1);
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 11px 14px;
}
.dn-checks .iconify { width: 18px; height: 18px; color: var(--oliva); flex-shrink: 0; }

.dn-tip {
  display: flex; align-items: flex-start; gap: 10px;
  margin-top: 18px;
  background: var(--crema-100);
  border: 1px dashed var(--terracotta-300);
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 13px; line-height: 1.5; color: var(--fg2);
}
.dn-tip b { color: var(--fg1); }
.dn-tip .iconify { width: 16px; height: 16px; color: var(--mostaza-700); flex-shrink: 0; margin-top: 1px; }

.dn-cta {
  position: relative;
  width: 100%; max-width: 440px;
  margin: 0 auto;
  padding: 8px 28px calc(18px + env(safe-area-inset-bottom, 0px));
}
</style>
