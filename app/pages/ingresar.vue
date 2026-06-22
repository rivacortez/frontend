<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { loginSchema, type LoginInput } from '#shared/schemas/auth'

useSeoMeta({ title: 'Iniciar sesión — GastronomIA' })

const route = useRoute()
const { fetch: refreshSession } = useUserSession()

const state = reactive<LoginInput>({ email: '', password: '' })
const showPassword = ref(false)
const remember = ref(true)
const loading = ref(false)
const errorMsg = ref<string | null>(null)

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
  <div class="login-screen">
    <header class="login-hdr">
      <UButton
        to="/"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        aria-label="Volver a la pantalla de inicio"
      />
    </header>

    <div class="login-body">
      <div class="login-brand">
        <div class="brand">
          <img src="/img/gastronomia-logo.svg" alt="GastronomIA" class="brand-logo">
        </div>
        <h1 class="login-title">Bienvenido de vuelta</h1>
        <p class="login-sub">Inicia sesión para continuar</p>
      </div>

      <UAlert
        v-if="errorMsg"
        color="error"
        variant="subtle"
        icon="i-lucide-alert-circle"
        :title="errorMsg"
        class="login-alert"
        role="alert"
      />

      <UForm
        :schema="loginSchema"
        :state="state"
        class="login-form"
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

        <div class="login-row">
          <UCheckbox v-model="remember" label="Mantener sesión iniciada" />
          <NuxtLink to="/recuperar" class="login-forgot">
            ¿Olvidaste tu contraseña?
          </NuxtLink>
        </div>

        <UButton
          type="submit"
          size="xl"
          block
          :loading="loading"
          class="mt-2"
        >
          Iniciar sesión
        </UButton>

        <p class="login-signup">
          ¿No tienes cuenta?
          <NuxtLink to="/registro">Crea una gratis</NuxtLink>
        </p>
      </UForm>

      <div class="login-demo" aria-label="Cuentas de demostración">
        <span class="eyebrow">Demo Motif Restobar</span>
        <p>
          <code>maria@motif.pe</code> (owner) ·
          <code>carlos@motif.pe</code> (manager) ·
          <code>staff@motif.pe</code> (staff)
        </p>
      </div>
    </div>

    <footer class="login-foot">
      <span>v0.1.0 · Hecho con <span class="heart">♥</span> en Lima, Perú</span>
    </footer>
  </div>
</template>

<style scoped>
.login-screen {
  min-height: 100dvh;
  display: flex; flex-direction: column;
  background: var(--crema);
}
.login-hdr {
  display: flex; align-items: center;
  height: 48px; padding: 8px;
  padding-top: calc(8px + env(safe-area-inset-top, 0px));
}
.login-body {
  flex: 1;
  width: 100%; max-width: 420px;
  margin: 0 auto;
  padding: 8px 24px 24px;
  display: flex; flex-direction: column;
}
.login-brand { display: flex; flex-direction: column; gap: 10px; }
.brand { display: flex; align-items: center; }
.brand-logo { height: 18px; width: auto; display: block; }
.login-title {
  margin: 0;
  font-weight: 600; font-size: 26px; line-height: 1.15;
  letter-spacing: -0.02em;
  color: var(--fg1);
  text-wrap: balance;
}
.login-sub { margin: -4px 0 0; font-size: 13.5px; color: var(--fg2); }
.login-alert { margin-top: 16px; }
.login-form {
  margin-top: 22px;
  display: flex; flex-direction: column; gap: 14px;
}
.login-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
  margin-top: 2px;
}
.login-forgot {
  font-size: 13px; font-weight: 500;
  color: var(--terracotta-700);
  text-decoration: none;
}
.login-forgot:hover { text-decoration: underline; }
.login-signup {
  text-align: center;
  font-size: 13px; color: var(--fg2);
  margin: 14px 0 0;
}
.login-signup a {
  color: var(--terracotta-700);
  font-weight: 600;
  text-decoration: none;
}
.login-signup a:hover { text-decoration: underline; }
.login-demo {
  margin-top: 28px;
  padding: 12px 14px;
  border: 1px dashed var(--terracotta-300);
  border-radius: 12px;
  background: var(--crema-100);
}
.login-demo p { margin: 6px 0 0; font-size: 12px; color: var(--fg2); line-height: 1.7; }
.login-demo code {
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--crema-200);
  padding: 1px 5px;
  border-radius: 4px;
}
.login-foot {
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  text-align: center;
  font-size: 12px; color: var(--fg3);
}
.heart { color: var(--terracotta); }
</style>
