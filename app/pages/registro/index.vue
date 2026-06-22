<script setup lang="ts">
useSeoMeta({ title: 'Crea tu cuenta — GastronomIA' })

const store = useOnboardingStore()
const showPassword = ref(false)

const emailOk = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(store.account.email))
const passwordOk = computed(() => store.account.password.length >= 8)
const canContinue = computed(() =>
  store.account.name.trim().length >= 2 && emailOk.value && passwordOk.value,
)

const strength = computed(() => {
  const p = store.account.password
  if (!p) return 0
  let score = 0
  if (p.length >= 8) score++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++
  if (/\d/.test(p) || /[^A-Za-z0-9]/.test(p)) score++
  return score
})
const STRENGTH_LABEL = ['', 'Débil', 'Aceptable', 'Fuerte']

function next(): void {
  if (!canContinue.value) return
  void navigateTo('/registro/verificar')
}
</script>

<template>
  <OnboardingStepShell
    :step="1"
    title="Crea tu cuenta"
    subtitle="Empieza gratis. Sin tarjeta de crédito."
    back="/bienvenida"
  >
    <form class="ob-form" novalidate @submit.prevent="next">
      <div class="field-block">
        <div class="field-label"><span>Tu nombre</span></div>
        <input v-model="store.account.name" class="field-input" type="text" placeholder="Ej: María Quispe" autocomplete="name" aria-label="Tu nombre">
      </div>
      <div class="field-block">
        <div class="field-label"><span>Email</span></div>
        <input v-model="store.account.email" class="field-input" type="email" placeholder="tu@correo.com" autocomplete="email" inputmode="email" aria-label="Email">
        <p v-if="store.account.email && !emailOk" class="ob-field-error">Email no válido</p>
      </div>
      <div class="field-block">
        <div class="field-label">
          <span>Contraseña</span>
          <span class="hint">mínimo 8 caracteres</span>
        </div>
        <div class="ob-pw-wrap">
          <input
            v-model="store.account.password"
            class="field-input"
            :type="showPassword ? 'text' : 'password'"
            placeholder="Crea una contraseña"
            autocomplete="new-password"
            aria-label="Contraseña"
          >
          <button
            type="button"
            class="ob-pw-toggle"
            :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
            @click="showPassword = !showPassword"
          >
            <UIcon :name="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" />
          </button>
        </div>
        <div v-if="store.account.password" class="ob-strength" aria-live="polite">
          <span v-for="i in 3" :key="i" class="bar" :class="{ on: strength >= i, good: strength === 3 }" />
          <span class="lbl">{{ STRENGTH_LABEL[strength] }}</span>
        </div>
      </div>
      <UCheckbox v-model="store.account.tips" label="Quiero recibir tips para mejorar mi rentabilidad" />
    </form>

    <template #cta>
      <UButton size="xl" block trailing-icon="i-lucide-arrow-right" :disabled="!canContinue" @click="next">
        Continuar
      </UButton>
      <p class="ob-login-link">
        ¿Ya tienes cuenta? <NuxtLink to="/ingresar">Inicia sesión</NuxtLink>
      </p>
    </template>
  </OnboardingStepShell>
</template>

<style scoped>
.ob-form { display: flex; flex-direction: column; }
.ob-field-error { font-size: 12px; color: var(--danger); margin: 6px 0 0; }
.ob-pw-wrap { position: relative; }
.ob-pw-wrap .field-input { padding-right: 44px; }
.ob-pw-toggle {
  position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
  width: 34px; height: 34px; border-radius: 9px;
  background: transparent; border: none;
  color: var(--fg3);
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.ob-pw-toggle .iconify { width: 17px; height: 17px; }
.ob-strength {
  display: flex; align-items: center; gap: 4px;
  margin-top: 8px;
}
.ob-strength .bar {
  width: 34px; height: 4px; border-radius: 999px;
  background: var(--crema-200);
}
.ob-strength .bar.on { background: var(--mostaza); }
.ob-strength .bar.on.good { background: var(--oliva); }
.ob-strength .lbl { font-size: 11px; color: var(--fg3); margin-left: 4px; }
.ob-login-link {
  text-align: center;
  font-size: 13px; color: var(--fg2);
  margin: 10px 0 0;
}
.ob-login-link a { color: var(--terracotta-700); font-weight: 600; text-decoration: none; }
</style>
