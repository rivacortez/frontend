<script setup lang="ts">
import { changePasswordSchema } from '#shared/schemas/auth'
import type { NotificationType } from '~/composables/use-notifications'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Perfil — GastronomIA' })

const { user, clear } = useUserSession()
const toast = useToast()

const ROLE_LABEL: Record<string, string> = {
  owner: 'Propietaria',
  manager: 'Gerente',
  staff: 'Colaborador',
}

const initials = computed(() =>
  (user.value?.name ?? '')
    .split(' ')
    .map(part => part[0])
    .slice(0, 2)
    .join(''),
)

/* ===== Preferencias de notificación (HU-10-03 · fix E01-1) =====
 * Antes los switches solo emitían un toast de éxito sin tocar el backend, así
 * que al recargar volvían al default (toast falso). Ahora derivan del estado
 * PERSISTIDO (`GET /api/notifications/preferences`) y cada cambio hace
 * `PATCH /api/notifications/preferences`; el catálogo de tipos es compartido con
 * la bandeja de notificaciones. Aplica a cualquier rol bajo su propio tenant. */
const { data: prefRows, isLoading: prefsLoading, error: prefsError } = useNotificationPreferences()
const setPreference = useSetPreference()

/**
 * Persiste el canal in-app de un tipo de notificación. Solo confirma con toast
 * de éxito en 2xx; si el backend falla, informa el error y el switch revierte
 * solo, porque su estado deriva de la query (que no cambió ante el fallo).
 */
async function savePref(type: NotificationType, value: boolean): Promise<void> {
  try {
    await setPreference.mutateAsync({ type, inApp: value })
    toast.add({ title: 'Preferencia guardada', icon: 'i-lucide-check' })
  }
  catch (error) {
    toast.add({
      title: errorMessage(error, 'No se pudo guardar la preferencia'),
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
  }
}

async function logout(): Promise<void> {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/ingresar')
}

/* ===== Cambio de contraseña (HU-01-06) ===== */
const showPassword = ref(false)
const pwd = reactive({ current: '', next: '', confirm: '' })
const pwdSaving = ref(false)
const pwdError = ref<string | null>(null)

const pwdValid = computed(() =>
  changePasswordSchema.safeParse({ currentPassword: pwd.current, newPassword: pwd.next }).success
  && pwd.next === pwd.confirm)

function openPassword(): void {
  pwd.current = ''
  pwd.next = ''
  pwd.confirm = ''
  pwdError.value = null
  showPassword.value = true
}

async function submitPassword(): Promise<void> {
  if (pwdSaving.value) return
  pwdError.value = null
  if (pwd.next !== pwd.confirm) {
    pwdError.value = 'Las contraseñas no coinciden'
    return
  }
  const parsed = changePasswordSchema.safeParse({ currentPassword: pwd.current, newPassword: pwd.next })
  if (!parsed.success) {
    pwdError.value = parsed.error.issues[0]?.message ?? 'Revisa los datos'
    return
  }
  pwdSaving.value = true
  try {
    await $fetch('/api/auth/password', { method: 'PATCH', body: parsed.data })
    showPassword.value = false
    toast.add({ title: 'Contraseña actualizada', icon: 'i-lucide-check-circle-2' })
  }
  catch (e) {
    const err = e as { data?: { message?: string }, statusMessage?: string }
    pwdError.value = err.data?.message ?? err.statusMessage ?? 'No se pudo cambiar la contraseña'
  }
  finally {
    pwdSaving.value = false
  }
}
</script>

<template>
  <div class="pf-screen">
    <UiScreenHeader title="Perfil" back="/app/menu" />

    <!-- Tarjeta de usuario -->
    <section class="pf-card pf-user">
      <span class="pf-avatar" aria-hidden="true">{{ initials }}<img class="pf-avatar-img" src="/img/avatar-default.jpg" alt=""></span>
      <div class="pf-user-meta">
        <span class="pf-name">{{ user?.name }}</span>
        <span class="pf-email">{{ user?.email }}</span>
        <span class="pf-role">
          <UIcon name="i-lucide-shield-check" />
          {{ ROLE_LABEL[user?.role ?? ''] ?? user?.role }} · Motif Restobar
        </span>
      </div>
      <UButton
        icon="i-lucide-pencil"
        color="neutral"
        variant="ghost"
        size="sm"
        aria-label="Editar perfil"
        @click="toast.add({ title: 'Edición de perfil disponible con la API (Sprint 1)', icon: 'i-lucide-info' })"
      />
    </section>

    <!-- Datos del negocio -->
    <section class="pf-section">
      <div class="eyebrow pf-eyebrow">Tu restaurante</div>
      <div class="pf-card pf-list">
        <NuxtLink to="/app/ajustes/negocio" class="pf-row">
          <span class="pf-row-ico"><UIcon name="i-lucide-store" /></span>
          <span class="pf-row-body">
            <span class="pf-row-label">Motif Restobar Karaoke</span>
            <span class="pf-row-sub">RUC 20612345678 · San Juan de Lurigancho</span>
          </span>
          <UIcon name="i-lucide-chevron-right" class="pf-chev" />
        </NuxtLink>
        <NuxtLink to="/app/ajustes" class="pf-row">
          <span class="pf-row-ico"><UIcon name="i-lucide-settings" /></span>
          <span class="pf-row-body">
            <span class="pf-row-label">Ajustes del negocio</span>
            <span class="pf-row-sub">Horarios, mesas, impuestos, pagos</span>
          </span>
          <UIcon name="i-lucide-chevron-right" class="pf-chev" />
        </NuxtLink>
      </div>
    </section>

    <!-- Preferencias de notificación (canal in-app) -->
    <section class="pf-section">
      <div class="eyebrow pf-eyebrow">Notificaciones · en la app</div>

      <!-- Loading: esqueleto mientras se cargan las preferencias persistidas -->
      <div v-if="prefsLoading && !prefRows" class="pf-card pf-list" aria-hidden="true">
        <div v-for="i in 4" :key="i" class="pf-row toggle">
          <span class="pf-row-body">
            <USkeleton class="pf-sk-label" />
            <USkeleton class="pf-sk-sub" />
          </span>
          <USkeleton class="pf-sk-switch" />
        </div>
      </div>

      <!-- Error: no se pudieron cargar las preferencias -->
      <UAlert
        v-else-if="prefsError"
        color="error"
        variant="subtle"
        icon="i-lucide-alert-circle"
        title="No se pudieron cargar tus preferencias"
        description="Revisa tu conexión e inténtalo de nuevo."
      />

      <!-- Datos: un switch por tipo, persistido en el backend -->
      <div v-else class="pf-card pf-list">
        <label v-for="p in NOTIFICATION_PREFERENCE_TYPES" :key="p.type" class="pf-row toggle">
          <span class="pf-row-body">
            <span class="pf-row-label">{{ p.label }}</span>
            <span class="pf-row-sub">{{ p.description }}</span>
          </span>
          <USwitch
            :model-value="isInAppEnabled(prefRows, p.type)"
            :disabled="setPreference.isLoading.value"
            :aria-label="`Notificarme: ${p.label}`"
            @update:model-value="(v: boolean) => savePref(p.type, v)"
          />
        </label>
      </div>
      <p class="pf-prefs-note">El aviso por correo llegará en una próxima versión.</p>
    </section>

    <!-- Cuenta -->
    <section class="pf-section">
      <div class="eyebrow pf-eyebrow">Cuenta</div>
      <div class="pf-card pf-list">
        <NuxtLink to="/app/ayuda" class="pf-row">
          <span class="pf-row-ico"><UIcon name="i-lucide-circle-help" /></span>
          <span class="pf-row-body"><span class="pf-row-label">Centro de ayuda</span></span>
          <UIcon name="i-lucide-chevron-right" class="pf-chev" />
        </NuxtLink>
        <button class="pf-row" @click="openPassword">
          <span class="pf-row-ico"><UIcon name="i-lucide-key-round" /></span>
          <span class="pf-row-body"><span class="pf-row-label">Cambiar contraseña</span></span>
          <UIcon name="i-lucide-chevron-right" class="pf-chev" />
        </button>
      </div>
      <UButton color="error" variant="subtle" icon="i-lucide-log-out" block size="lg" class="pf-logout" @click="logout">
        Cerrar sesión
      </UButton>
      <p class="pf-version">GastronomIA v0.1.0 · Hecho con <span class="heart">♥</span> en Lima, Perú</p>
    </section>

    <!-- Sheet: cambio de contraseña (HU-01-06) -->
    <UiBottomSheet
      v-model="showPassword"
      title="Cambiar contraseña"
      subtitle="Mínimo 12 caracteres con mayúscula, minúscula, número y símbolo."
    >
      <div class="pf-pwd-form">
        <UInput
          v-model="pwd.current"
          type="password"
          size="lg"
          autocomplete="current-password"
          placeholder="Tu contraseña actual"
        />
        <UInput
          v-model="pwd.next"
          type="password"
          size="lg"
          autocomplete="new-password"
          placeholder="Nueva contraseña"
        />
        <UInput
          v-model="pwd.confirm"
          type="password"
          size="lg"
          autocomplete="new-password"
          placeholder="Repite la contraseña"
        />
        <p v-if="pwdError" class="pf-pwd-error" role="alert">{{ pwdError }}</p>
      </div>
      <template #cta>
        <UButton block size="lg" :loading="pwdSaving" :disabled="!pwdValid" @click="submitPassword">
          Actualizar contraseña
        </UButton>
      </template>
    </UiBottomSheet>
  </div>
</template>

<style scoped>
.pf-screen {
  max-width: 560px;
  margin: 0 auto;
  padding-bottom: 24px;
}
.pf-section { padding: 0 20px; margin-bottom: 18px; }
.pf-eyebrow { padding: 4px 0 10px; }
.pf-card {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
}
.pf-user {
  margin: 0 20px 20px;
  display: flex; align-items: center; gap: 14px;
  padding: 16px;
}
.pf-avatar {
  position: relative; overflow: hidden;
  width: 56px; height: 56px; border-radius: 50%;
  background: var(--terracotta); color: var(--crema-100);
  font-size: 19px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.pf-avatar-img {
  position: absolute; inset: 0;
  width: 100%; height: 100%; object-fit: cover; object-position: center 18%;
}
.pf-user-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.pf-name { font-size: 17px; font-weight: 600; color: var(--fg1); }
.pf-email {
  font-size: 12.5px; color: var(--fg3);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pf-role {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11.5px; font-weight: 600; color: var(--oliva-700);
  margin-top: 2px;
}
.pf-role .iconify { width: 12px; height: 12px; }

.pf-list { overflow: hidden; }
.pf-row {
  display: flex; align-items: center; gap: 12px;
  width: 100%;
  padding: 13px 14px;
  border-bottom: 1px solid var(--border-subtle);
  background: transparent; border-left: none; border-right: none; border-top: none;
  font: inherit;
  cursor: pointer;
  text-align: left;
  text-decoration: none;
  transition: background var(--dur) var(--ease-standard);
}
.pf-row:last-child { border-bottom: none; }
.pf-row:hover { background: var(--crema-50); }
.pf-row.toggle { cursor: default; }
.pf-row-ico {
  width: 36px; height: 36px; border-radius: 10px;
  background: var(--crema-200); color: var(--terracotta-700);
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.pf-row-ico .iconify { width: 17px; height: 17px; }
.pf-row-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.pf-row-label { font-size: 14px; font-weight: 600; color: var(--fg1); }
.pf-row-sub { font-size: 12px; color: var(--fg3); }
.pf-chev { width: 16px; height: 16px; color: var(--fg3); flex-shrink: 0; }
.pf-logout { margin-top: 12px; }
.pf-version {
  text-align: center;
  font-size: 11.5px; color: var(--fg3);
  margin: 16px 0 0;
}
.heart { color: var(--terracotta); }

.pf-prefs-note { font-size: 11.5px; color: var(--fg3); margin: 8px 4px 0; }
.pf-sk-label { width: 45%; height: 14px; }
.pf-sk-sub { width: 70%; height: 11px; margin-top: 4px; }
.pf-sk-switch { width: 36px; height: 20px; border-radius: 999px; flex-shrink: 0; }

.pf-pwd-form { display: flex; flex-direction: column; gap: 12px; padding: 4px 0 8px; }
.pf-pwd-error { color: var(--danger); font-size: 12.5px; margin: 2px 0 0; }
</style>
