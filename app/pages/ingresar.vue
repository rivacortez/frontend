<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { loginSchema, type LoginInput } from '#shared/schemas/auth'

useSeoMeta({ title: 'Iniciar sesión — GastronomIA' })

const route = useRoute()
const toast = useToast()
const { fetch: refreshSession } = useUserSession()

const state = reactive<LoginInput>({ email: '', password: '' })
const showPassword = ref(false)
const remember = ref(true)
const loading = ref(false)
const errorMsg = ref<string | null>(null)
const passwordInput = ref<{ inputRef?: HTMLInputElement } | null>(null)

// Cuentas de la demo Motif Restobar. Un click autocompleta el email y enfoca
// la contraseña — pensado para recorrer la demo por rol sin tipear.
const demoAccounts = [
  { email: 'maria@motif.pe', role: 'Dueña', tag: 'owner' },
  { email: 'carlos@motif.pe', role: 'Gerente', tag: 'manager' },
  { email: 'staff@motif.pe', role: 'Salón', tag: 'staff' },
] as const

function useDemo(email: string): void {
  state.email = email
  // Enfoca la contraseña tras el tick de render del valor.
  nextTick(() => passwordInput.value?.inputRef?.focus())
}

function onGoogle(): void {
  toast.add({ title: 'Acceso con Google · Próximamente', icon: 'i-lucide-info' })
}

async function onSubmit(event: FormSubmitEvent<LoginInput>): Promise<void> {
  loading.value = true
  errorMsg.value = null
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: event.data })
    await refreshSession()
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/app'
    await navigateTo(redirect)
  }
  catch {
    errorMsg.value = 'Credenciales inválidas. Verifica tu email y contraseña.'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login">
    <!-- Panel de marca (banner editorial) — visible en desktop -->
    <AuthBanner />

    <!-- Panel del formulario -->
    <main class="login-main">
      <header class="main-hdr">
        <img src="/img/gastronomia-logo.svg" alt="GastronomIA" class="main-logo">
      </header>

      <div class="main-body">
        <div class="form-intro">
          <div class="form-avatar" aria-hidden="true">
            <img src="/img/logo.svg" alt="">
          </div>
          <h1 class="form-title">Bienvenido de vuelta</h1>
          <p class="form-sub">Ingresa para retomar el control de tu restaurante.</p>
        </div>

        <UAlert
          v-if="errorMsg"
          color="error"
          variant="subtle"
          icon="i-lucide-alert-circle"
          :title="errorMsg"
          class="form-alert"
          role="alert"
        />

        <UForm
          :schema="loginSchema"
          :state="state"
          class="form"
          @submit="onSubmit"
        >
          <UFormField label="Email" name="email">
            <UInput
              v-model="state.email"
              type="email"
              size="xl"
              icon="i-lucide-mail"
              placeholder="tu@correo.com"
              autocomplete="email"
              inputmode="email"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Contraseña" name="password">
            <UInput
              ref="passwordInput"
              v-model="state.password"
              :type="showPassword ? 'text' : 'password'"
              size="xl"
              icon="i-lucide-lock"
              placeholder="Tu contraseña"
              autocomplete="current-password"
              class="w-full"
            >
              <template #trailing>
                <UButton
                  :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  color="neutral"
                  variant="link"
                  size="sm"
                  :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                  :aria-pressed="showPassword"
                  @click="showPassword = !showPassword"
                />
              </template>
            </UInput>
          </UFormField>

          <div class="form-row">
            <UCheckbox v-model="remember" label="Mantener sesión iniciada" />
            <NuxtLink to="/recuperar" class="form-forgot">
              ¿Olvidaste tu contraseña?
            </NuxtLink>
          </div>

          <UButton
            type="submit"
            size="xl"
            block
            :loading="loading"
            class="mt-1"
          >
            Iniciar sesión
          </UButton>

          <div class="form-divider"><span>o continúa con</span></div>

          <button type="button" class="google-btn" @click="onGoogle">
            <svg class="google-ic" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
            </svg>
            Continuar con Google
          </button>

          <p class="form-signup">
            ¿No tienes cuenta?
            <NuxtLink to="/registro">Crea una gratis</NuxtLink>
          </p>
        </UForm>

        <div class="demo">
          <div class="demo-hdr">
            <span class="demo-eyebrow">Demo · Motif Restobar</span>
            <span class="demo-hint">Probá por rol con un click</span>
          </div>
          <div class="demo-chips">
            <button
              v-for="acc in demoAccounts"
              :key="acc.email"
              type="button"
              class="demo-chip"
              @click="useDemo(acc.email)"
            >
              <span class="chip-role">{{ acc.role }}</span>
              <span class="chip-mail">{{ acc.email }}</span>
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.login {
  min-height: 100dvh;
  display: grid;
  grid-template-columns: 1fr;
  background: var(--crema);
}

/* ───────────────────────── Panel del formulario ───────────────────────── */
.login-main {
  display: flex; flex-direction: column;
  min-height: 100dvh;
}
.main-hdr {
  display: flex; align-items: center; justify-content: flex-end;
  height: 56px; padding: 8px 16px;
  padding-top: calc(8px + env(safe-area-inset-top, 0px));
}
.main-logo { height: 16px; width: auto; }
.main-body {
  flex: 1;
  width: 100%; max-width: 392px;
  margin: 0 auto;
  padding: 12px 24px 24px;
  display: flex; flex-direction: column;
  justify-content: center;
}
.form-intro {
  display: flex; flex-direction: column; align-items: center;
  gap: 8px; text-align: center;
}
.form-avatar {
  width: 60px; height: 60px;
  border-radius: 18px;
  background: radial-gradient(120% 120% at 15% 15%, var(--terracotta-300) 0%, var(--terracotta) 55%, var(--terracotta-700) 100%);
  display: inline-flex; align-items: center; justify-content: center;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 8px 20px rgba(168, 84, 47, 0.22);
  margin-bottom: 6px;
}
.form-avatar img {
  width: 34px; height: 34px;
  filter: brightness(0) invert(1);
  opacity: 0.96;
}
.form-title {
  font-family: var(--font-serif);
  margin: 0;
  font-weight: 500; font-size: 30px; line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--fg1);
  text-wrap: balance;
}
.form-sub {
  margin: 0; font-size: 14px; color: var(--fg2); line-height: 1.5;
  max-width: 34ch;
}
.form-alert { margin-top: 18px; }
.form {
  margin-top: 24px;
  display: flex; flex-direction: column; gap: 16px;
}
.form-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
}
.form-forgot {
  font-size: 13px; font-weight: 500;
  color: var(--terracotta-700); text-decoration: none;
}
.form-forgot:hover { text-decoration: underline; }
.form-signup {
  text-align: center; font-size: 13px; color: var(--fg2);
  margin: 12px 0 0;
}
.form-signup a { color: var(--terracotta-700); font-weight: 600; text-decoration: none; }
.form-signup a:hover { text-decoration: underline; }

/* ───────────────────────── Divisor + Google ───────────────────────── */
.form-divider {
  display: flex; align-items: center; gap: 12px;
  margin: 4px 0;
  color: var(--fg3); font-size: 12px;
}
.form-divider::before,
.form-divider::after {
  content: ''; flex: 1; height: 1px; background: var(--border-subtle);
}
.google-btn {
  width: 100%;
  display: inline-flex; align-items: center; justify-content: center; gap: 10px;
  height: 48px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--pure-white);
  color: var(--fg1);
  font-family: inherit;
  font-size: 14px; font-weight: 600;
  cursor: pointer;
  transition: border-color var(--dur), background var(--dur), box-shadow var(--dur);
}
.google-btn:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-sm);
}
.google-ic { width: 18px; height: 18px; flex: none; }

/* ───────────────────────── Cuentas demo (chips) ───────────────────────── */
.demo {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--border-subtle);
}
.demo-hdr {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 8px; margin-bottom: 12px;
}
.demo-eyebrow {
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--fg3);
}
.demo-hint { font-size: 11px; color: var(--fg3); }
.demo-chips { display: flex; flex-direction: column; gap: 8px; }
.demo-chip {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--crema-50);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.05s ease;
}
.demo-chip:hover {
  border-color: var(--terracotta-300);
  background: var(--crema-100);
}
.demo-chip:active { transform: scale(0.99); }
.chip-role { font-size: 13px; font-weight: 600; color: var(--fg1); }
.chip-mail {
  font-family: var(--font-mono);
  font-size: 11.5px; color: var(--fg2);
}

/* ───────────────────────── Desktop: split-screen ───────────────────────── */
@media (min-width: 900px) {
  .login { grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); }
  .main-hdr { display: none; }
  .main-body { max-width: 400px; padding-block: 40px; }
}
</style>
