<script setup lang="ts">
import type { AppNotification, NotificationKind } from '#shared/types/domain'
import type { NotificationType } from '~/composables/use-notifications'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Notificaciones — GastronomIA' })

const { data: notifications } = useNotifications()
const markRead = useMarkRead()
const markAllRead = useMarkAllRead()

const KIND_META: Record<NotificationKind, { icon: string, cls: string }> = {
  critical: { icon: 'i-lucide-alert-triangle', cls: 'critical' },
  warning: { icon: 'i-lucide-alert-circle', cls: 'warning' },
  info: { icon: 'i-lucide-lightbulb', cls: 'info' },
  success: { icon: 'i-lucide-check-circle-2', cls: 'success' },
}

// Etiqueta corta por TIPO real del backend (lo que ahora carga `AppNotification.type`),
// para que la fila identifique el origen además de la severidad (icono/color del `kind`).
const TYPE_LABEL: Record<NotificationType, string> = {
  low_stock: 'Stock',
  bill_requested: 'Cuenta',
  order_ready: 'Cocina',
  system: 'Sistema',
}

const all = computed(() => notifications.value ?? [])
const unread = computed(() => all.value.filter(n => !n.read))
const read = computed(() => all.value.filter(n => n.read))

async function open(n: AppNotification): Promise<void> {
  if (!n.read) await markRead.mutateAsync(n.id)
  if (n.actionTo) await navigateTo(n.actionTo)
}

async function markAll(): Promise<void> {
  await markAllRead.mutateAsync()
}

// ---- HU-10-03 · Preferencias (canal in-app por tipo) ----
const showPrefs = ref(false)
const { data: prefRows } = useNotificationPreferences()
const setPreference = useSetPreference()
const toast = useToast()

const PREF_TYPES: { type: NotificationType, label: string, sub: string }[] = [
  { type: 'low_stock', label: 'Stock crítico', sub: 'Insumos bajo el mínimo de reorden' },
  { type: 'bill_requested', label: 'Cuenta solicitada', sub: 'Una mesa pidió la cuenta' },
  { type: 'order_ready', label: 'Pedido listo', sub: 'Cocina marcó un plato como listo' },
  { type: 'system', label: 'Sistema y recomendaciones', sub: 'Reportes, alertas IA y avisos generales' },
]

// El backend solo persiste las preferencias modificadas; ausencia = default in-app activo.
function inAppEnabled(type: NotificationType): boolean {
  const row = (prefRows.value ?? []).find(p => p.type === type)
  return row ? row.inApp : true
}

async function toggleInApp(type: NotificationType, value: boolean): Promise<void> {
  try {
    await setPreference.mutateAsync({ type, inApp: value })
  }
  catch (error) {
    toast.add({ title: errorMessage(error, 'No se pudo guardar la preferencia'), color: 'error', icon: 'i-lucide-alert-circle' })
  }
}
</script>

<template>
  <div class="ntf-screen">
    <UiScreenHeader title="Notificaciones" :subtitle="unread.length ? `${unread.length} sin leer` : 'Todo al día'" back="/app">
      <template #trailing>
        <UButton
          v-if="unread.length"
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-lucide-check-check"
          @click="markAll"
        >
          Marcar leídas
        </UButton>
        <UButton
          size="sm"
          color="neutral"
          :variant="showPrefs ? 'solid' : 'ghost'"
          icon="i-lucide-settings-2"
          aria-label="Preferencias de notificaciones"
          :aria-pressed="showPrefs"
          @click="showPrefs = !showPrefs"
        />
      </template>
    </UiScreenHeader>

    <section v-if="showPrefs" class="ntf-section ntf-prefs">
      <div class="eyebrow ntf-eyebrow">Preferencias · en la app</div>
      <div class="ntf-prefs-card">
        <label v-for="p in PREF_TYPES" :key="p.type" class="ntf-pref-row">
          <span class="ntf-pref-body">
            <span class="ntf-pref-label">{{ p.label }}</span>
            <span class="ntf-pref-sub">{{ p.sub }}</span>
          </span>
          <USwitch
            :model-value="inAppEnabled(p.type)"
            :disabled="setPreference.isLoading.value"
            @update:model-value="(v: boolean) => toggleInApp(p.type, v)"
          />
        </label>
        <p class="ntf-prefs-note">El aviso por correo llegará en una próxima versión.</p>
      </div>
    </section>

    <template v-if="all.length">
      <section v-if="unread.length" class="ntf-section">
        <div class="eyebrow ntf-eyebrow">Nuevas</div>
        <div class="ntf-list">
          <button
            v-for="n in unread"
            :key="n.id"
            class="ntf-row unread"
            :class="KIND_META[n.kind].cls"
            @click="open(n)"
          >
            <span class="ntf-ico" aria-hidden="true"><UIcon :name="KIND_META[n.kind].icon" /></span>
            <span class="ntf-body">
              <span class="ntf-title">
                {{ n.title }}
                <span class="ntf-type">{{ TYPE_LABEL[n.type] }}</span>
              </span>
              <span class="ntf-text">{{ n.body }}</span>
              <span v-if="n.actionLabel" class="ntf-action">{{ n.actionLabel }} <UIcon name="i-lucide-arrow-right" /></span>
            </span>
            <span class="ntf-right">
              <span class="ntf-time">{{ timeAgo(n.date) }}</span>
              <span class="ntf-dot" aria-label="Sin leer" />
            </span>
          </button>
        </div>
      </section>

      <section v-if="read.length" class="ntf-section">
        <div class="eyebrow ntf-eyebrow">Anteriores</div>
        <div class="ntf-list">
          <button
            v-for="n in read"
            :key="n.id"
            class="ntf-row"
            :class="KIND_META[n.kind].cls"
            @click="open(n)"
          >
            <span class="ntf-ico" aria-hidden="true"><UIcon :name="KIND_META[n.kind].icon" /></span>
            <span class="ntf-body">
              <span class="ntf-title">
                {{ n.title }}
                <span class="ntf-type">{{ TYPE_LABEL[n.type] }}</span>
              </span>
              <span class="ntf-text">{{ n.body }}</span>
            </span>
            <span class="ntf-right">
              <span class="ntf-time">{{ timeAgo(n.date) }}</span>
            </span>
          </button>
        </div>
      </section>
    </template>

    <UiEmptyState
      v-else
      icon="i-lucide-bell"
      title="Sin notificaciones"
      subtitle="Las alertas de margen, stock y recomendaciones IA aparecerán aquí."
    />
  </div>
</template>

<style scoped>
.ntf-screen {
  max-width: 640px;
  margin: 0 auto;
  padding-bottom: 24px;
}
.ntf-section { padding: 0 20px; margin-bottom: 18px; }
.ntf-eyebrow { padding: 4px 0 10px; }
.ntf-list {
  display: flex; flex-direction: column;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--pure-white);
  overflow: hidden;
}
.ntf-row {
  position: relative;
  display: flex; align-items: flex-start; gap: 12px;
  padding: 14px;
  border-bottom: 1px solid var(--border-subtle);
  background: transparent; border-left: none; border-right: none; border-top: none;
  font: inherit;
  cursor: pointer;
  text-align: left;
  transition: background var(--dur) var(--ease-standard);
}
.ntf-row:last-child { border-bottom: none; }
.ntf-row:hover { background: var(--crema-50); }
.ntf-row.unread { background: var(--crema-50); }
.ntf-row.unread:hover { background: var(--crema-100); }
.ntf-row::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0;
  width: 3px;
}
.ntf-row.critical::before { background: var(--danger); }
.ntf-row.warning::before { background: var(--mostaza); }
.ntf-row.info::before { background: var(--info); }
.ntf-row.success::before { background: var(--oliva); }
.ntf-ico {
  width: 36px; height: 36px; border-radius: 10px;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.ntf-ico .iconify { width: 17px; height: 17px; }
.ntf-row.critical .ntf-ico { background: var(--danger-bg); color: var(--danger); }
.ntf-row.warning .ntf-ico { background: var(--warning-bg); color: var(--mostaza-700); }
.ntf-row.info .ntf-ico { background: var(--info-bg); color: var(--info); }
.ntf-row.success .ntf-ico { background: var(--success-bg); color: var(--oliva-700); }
.ntf-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ntf-title { font-size: 13.5px; font-weight: 600; color: var(--fg1); line-height: 1.3; }
.ntf-type {
  display: inline-block;
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
  color: var(--fg3);
  background: var(--crema-200);
  padding: 1px 6px; border-radius: 999px;
  vertical-align: middle;
  margin-left: 6px;
}
.ntf-text { font-size: 12.5px; color: var(--fg2); line-height: 1.45; }
.ntf-action {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; font-weight: 600;
  color: var(--terracotta-700);
  margin-top: 4px;
}
.ntf-action .iconify { width: 12px; height: 12px; }
.ntf-right {
  display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
  flex-shrink: 0;
}
.ntf-time { font-size: 10.5px; color: var(--fg3); white-space: nowrap; }
.ntf-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--terracotta);
}

/* ---- Preferencias (canal in-app por tipo) ---- */
.ntf-prefs-card {
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--pure-white);
  overflow: hidden;
}
.ntf-pref-row {
  display: flex; align-items: center; gap: 12px;
  padding: 13px 14px;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
}
.ntf-pref-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ntf-pref-label { font-size: 13.5px; font-weight: 600; color: var(--fg1); }
.ntf-pref-sub { font-size: 12px; color: var(--fg3); line-height: 1.4; }
.ntf-prefs-note {
  padding: 11px 14px;
  font-size: 11.5px; color: var(--fg3);
}
</style>
