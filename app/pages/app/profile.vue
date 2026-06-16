<script setup lang="ts">
import { changePasswordSchema } from '#shared/schemas/auth'

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

const prefs = reactive({
  notifyCritical: true,
  notifyDaily: true,
  notifyWeekly: false,
  sounds: true,
})

function savePrefs(): void {
  toast.add({ title: 'Preferencias guardadas', icon: 'i-lucide-check' })
}

async function logout(): Promise<void> {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/login')
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
      <span class="pf-avatar" aria-hidden="true">{{ initials }}</span>
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
        <NuxtLink to="/app/settings/business" class="pf-row">
          <span class="pf-row-ico"><UIcon name="i-lucide-store" /></span>
          <span class="pf-row-body">
            <span class="pf-row-label">Motif Restobar Karaoke</span>
            <span class="pf-row-sub">RUC 20612345678 · San Juan de Lurigancho</span>
          </span>
          <UIcon name="i-lucide-chevron-right" class="pf-chev" />
        </NuxtLink>
        <NuxtLink to="/app/settings" class="pf-row">
          <span class="pf-row-ico"><UIcon name="i-lucide-settings" /></span>
          <span class="pf-row-body">
            <span class="pf-row-label">Ajustes del negocio</span>
            <span class="pf-row-sub">Horarios, mesas, impuestos, pagos</span>
          </span>
          <UIcon name="i-lucide-chevron-right" class="pf-chev" />
        </NuxtLink>
      </div>
    </section>

    <!-- Preferencias -->
    <section class="pf-section">
      <div class="eyebrow pf-eyebrow">Notificaciones</div>
      <div class="pf-card pf-list">
        <label class="pf-row toggle">
          <span class="pf-row-body">
            <span class="pf-row-label">Alertas críticas</span>
            <span class="pf-row-sub">Margen en riesgo, stock crítico</span>
          </span>
          <USwitch v-model="prefs.notifyCritical" @update:model-value="savePrefs" />
        </label>
        <label class="pf-row toggle">
          <span class="pf-row-body">
            <span class="pf-row-label">Resumen diario</span>
            <span class="pf-row-sub">Ventas y ocupación al cierre</span>
          </span>
          <USwitch v-model="prefs.notifyDaily" @update:model-value="savePrefs" />
        </label>
        <label class="pf-row toggle">
          <span class="pf-row-body">
            <span class="pf-row-label">Reporte semanal</span>
            <span class="pf-row-sub">Análisis IA cada lunes</span>
          </span>
          <USwitch v-model="prefs.notifyWeekly" @update:model-value="savePrefs" />
        </label>
        <label class="pf-row toggle">
          <span class="pf-row-body">
            <span class="pf-row-label">Sonidos</span>
            <span class="pf-row-sub">Al recibir comandas y alertas</span>
          </span>
          <USwitch v-model="prefs.sounds" @update:model-value="savePrefs" />
        </label>
      </div>
    </section>

    <!-- Cuenta -->
    <section class="pf-section">
      <div class="eyebrow pf-eyebrow">Cuenta</div>
      <div class="pf-card pf-list">
        <NuxtLink to="/app/help" class="pf-row">
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
  width: 56px; height: 56px; border-radius: 50%;
  background: var(--terracotta); color: var(--crema-100);
  font-size: 19px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
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

.pf-pwd-form { display: flex; flex-direction: column; gap: 12px; padding: 4px 0 8px; }
.pf-pwd-error { color: var(--danger); font-size: 12.5px; margin: 2px 0 0; }
</style>
