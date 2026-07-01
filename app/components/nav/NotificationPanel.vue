<script setup lang="ts">
/**
 * NotificationPanel — Popover panel anchored to the AppTopbar bell button.
 *
 * Controlled by the parent via `open` prop + `close` emit. Parent is responsible
 * for toggling open on bell click, closing on click-outside, and closing on Escape
 * (handled in AppTopbar with VueUse `onClickOutside` + `useEventListener`).
 *
 * Data comes from the shared `useNotifications` composable (same Pinia Colada
 * cache as the full notifications page — no duplication). Mutations invalidate
 * the `["notifications"]` key, so the badge in AppTopbar updates automatically.
 *
 * Focus contract:
 *   - On open: first interactive element in the panel receives focus.
 *   - On close via `close` emit: parent returns focus to the bell button.
 *   - Panel renders below the bell in the DOM; `aria-modal="false"` keeps the
 *     rest of the page accessible (this is a non-modal overlay, not a trap).
 */
import type { AppNotification, NotificationKind } from '#shared/types/domain'
import type { NotificationType } from '~/composables/use-notifications'

const props = defineProps<{
  /** Whether the panel is currently visible. Controlled by AppTopbar. */
  open: boolean
}>()

const emit = defineEmits<{
  /**
   * Emitted when the panel wants to close itself (item click with/without
   * navigation, "Ver todas" link). Parent should call `panelOpen = false`
   * and return focus to the bell button.
   */
  close: []
}>()

/** Maximum notifications shown in the panel. Full history lives on /app/notificaciones. */
const POPOVER_LIMIT = 8

const { data: notifications } = useNotifications({ limit: () => POPOVER_LIMIT })
const markRead = useMarkRead()
const markAllRead = useMarkAllRead()
const toast = useToast()

const panelRef = ref<HTMLElement | null>(null)

/**
 * Move focus into the panel when it opens so keyboard users can interact
 * without Tab-jumping past the invisible backdrop.
 */
watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    await nextTick()
    const first = panelRef.value?.querySelector<HTMLElement>(
      'button:not([disabled]), a[href]',
    )
    ;(first ?? panelRef.value)?.focus()
  },
)

const items = computed<AppNotification[]>(() => notifications.value ?? [])
const hasUnread = computed(() => items.value.some((n) => !n.read))

/** Visual metadata by notification severity (kind). Matches notificaciones.vue for consistency. */
const KIND_META: Record<NotificationKind, { icon: string; cls: string }> = {
  critical: { icon: 'i-lucide-alert-triangle', cls: 'critical' },
  warning:  { icon: 'i-lucide-alert-circle',   cls: 'warning'  },
  info:     { icon: 'i-lucide-lightbulb',       cls: 'info'     },
  success:  { icon: 'i-lucide-check-circle-2',  cls: 'success'  },
}

/** Short source label by backend notification type. */
const TYPE_LABEL: Record<NotificationType, string> = {
  low_stock:      'Stock',
  bill_requested: 'Cuenta',
  order_ready:    'Cocina',
  system:         'Sistema',
}

/**
 * Handle an item click: mark as read, emit close (parent returns focus to bell),
 * then navigate if the notification has an action route.
 * Navigation happens AFTER close so focus management is clean.
 */
async function handleItemClick(n: AppNotification): Promise<void> {
  if (!n.read) {
    try {
      await markRead.mutateAsync(n.id)
    } catch (error) {
      toast.add({
        title: errorMessage(error, 'No se pudo marcar como leída'),
        color: 'error',
        icon: 'i-lucide-alert-circle',
      })
    }
  }
  emit('close')
  if (n.actionTo) await navigateTo(n.actionTo)
}

/** Mark all visible notifications as read. Panel stays open. */
async function handleMarkAll(): Promise<void> {
  try {
    await markAllRead.mutateAsync()
  } catch (error) {
    toast.add({
      title: errorMessage(error, 'No se pudo marcar todas como leídas'),
      color: 'error',
      icon: 'i-lucide-alert-circle',
    })
  }
}

/**
 * Called when the user clicks "Ver todas". The NuxtLink handles navigation;
 * we just emit close so the parent closes the panel and returns focus.
 */
function handleViewAll(): void {
  emit('close')
}
</script>

<template>
  <Transition name="np">
    <div
      v-if="open"
      ref="panelRef"
      class="np-panel"
      role="dialog"
      aria-label="Notificaciones"
      aria-modal="false"
      tabindex="-1"
    >
      <!-- Panel header: title + mark-all action -->
      <div class="np-head">
        <span class="np-head-title">Notificaciones</span>
        <button
          v-if="hasUnread"
          type="button"
          class="np-head-action"
          :disabled="markAllRead.isLoading.value"
          @click="handleMarkAll"
        >
          Marcar leídas
        </button>
      </div>

      <!-- Loading skeleton (data not yet in cache) -->
      <template v-if="notifications === undefined">
        <div class="np-skeleton" aria-label="Cargando notificaciones" aria-busy="true">
          <div v-for="i in 3" :key="i" class="np-skeleton-row">
            <div class="np-skeleton-ico" />
            <div class="np-skeleton-lines">
              <div class="np-skeleton-line" :style="{ width: `${[72, 88, 60][i - 1]}%` }" />
              <div class="np-skeleton-line np-skeleton-line--short" style="width: 40%" />
            </div>
          </div>
        </div>
      </template>

      <!-- Notification list -->
      <template v-else-if="items.length">
        <ul class="np-list" role="list">
          <li
            v-for="n in items"
            :key="n.id"
            class="np-item"
            :class="[KIND_META[n.kind].cls, { 'is-unread': !n.read }]"
          >
            <button
              type="button"
              class="np-item-btn"
              :aria-label="`${n.title}${!n.read ? ' — sin leer' : ''}. ${n.body}`"
              @click="handleItemClick(n)"
            >
              <!-- Kind icon -->
              <span class="np-ico" aria-hidden="true">
                <UIcon :name="KIND_META[n.kind].icon" class="np-ico-glyph" />
              </span>

              <!-- Content body -->
              <span class="np-body">
                <span class="np-title">
                  {{ n.title }}
                  <span class="np-type-pill">{{ TYPE_LABEL[n.type] }}</span>
                </span>
                <span class="np-text">{{ n.body }}</span>
                <span v-if="n.actionLabel" class="np-action-label" aria-hidden="true">
                  {{ n.actionLabel }}
                  <UIcon name="i-lucide-arrow-right" class="np-action-arrow" />
                </span>
              </span>

              <!-- Time + unread indicator -->
              <span class="np-meta" aria-hidden="true">
                <span class="np-time">{{ timeAgo(n.date) }}</span>
                <span v-if="!n.read" class="np-dot" />
              </span>
            </button>
          </li>
        </ul>
      </template>

      <!-- Empty state -->
      <div v-else class="np-empty" role="status">
        <UIcon name="i-lucide-bell" class="np-empty-ico" aria-hidden="true" />
        <p class="np-empty-title">Sin notificaciones</p>
        <p class="np-empty-sub">Las alertas de stock y sistema aparecerán aquí.</p>
      </div>

      <!-- Footer: link to the full notifications page -->
      <div class="np-foot">
        <NuxtLink
          to="/app/notificaciones"
          class="np-foot-link"
          @click="handleViewAll"
        >
          Ver todas las notificaciones
          <UIcon name="i-lucide-arrow-right" class="np-foot-arrow" aria-hidden="true" />
        </NuxtLink>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ---- Panel shell ---- */
.np-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  /* min() avoids overflow on narrow viewports; 24px = margins on each side */
  width: min(360px, calc(100vw - 24px));
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--shadow-lg);
  z-index: 50;
  /* tabindex="-1" receives programmatic focus; no visible outline on panel itself */
  outline: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ---- Entrance / exit transition ---- */
.np-enter-active {
  transition:
    opacity var(--dur-fast) var(--ease-standard),
    transform var(--dur-fast) var(--ease-standard);
}
.np-leave-active {
  transition:
    opacity var(--dur-fast) var(--ease-standard),
    transform var(--dur-fast) var(--ease-standard);
}
.np-enter-from,
.np-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}
@media (prefers-reduced-motion: reduce) {
  .np-enter-active,
  .np-leave-active { transition: none; }
}

/* ---- Header ---- */
.np-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
.np-head-title {
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--fg1);
}
.np-head-action {
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--terracotta);
  background: none;
  border: none;
  padding: 6px 0;
  cursor: pointer;
  /* WCAG 2.2: 24px minimum interactive height; surrounding whitespace supplements */
  min-height: 32px;
  transition: color var(--dur) var(--ease-standard);
}
.np-head-action:hover { color: var(--terracotta-700); }
.np-head-action:disabled { opacity: 0.5; cursor: not-allowed; }
.np-head-action:focus-visible {
  outline: 2px solid var(--terracotta);
  outline-offset: 2px;
  border-radius: 4px;
}

/* ---- Loading skeleton ---- */
.np-skeleton { padding: 8px 0; }
.np-skeleton-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
}
.np-skeleton-ico {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--crema-200);
  flex-shrink: 0;
  animation: np-pulse 1.4s ease-in-out infinite;
}
.np-skeleton-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.np-skeleton-line {
  height: 11px;
  border-radius: 6px;
  background: var(--crema-200);
  animation: np-pulse 1.4s ease-in-out infinite;
}
.np-skeleton-line--short { height: 9px; }
@keyframes np-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.45; }
}
@media (prefers-reduced-motion: reduce) {
  .np-skeleton-ico,
  .np-skeleton-line { animation: none; opacity: 0.6; }
}

/* ---- Notification list ---- */
.np-list {
  list-style: none;
  margin: 0;
  padding: 6px 0;
  max-height: 380px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
/* Thin scrollbar (Chromium/WebKit) — matches the rest of the app */
.np-list::-webkit-scrollbar { width: 4px; }
.np-list::-webkit-scrollbar-track { background: transparent; }
.np-list::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}

/* ---- Item ---- */
.np-item { position: relative; }
/* Left severity stripe — same language as .ntf-row in notificaciones.vue */
.np-item::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
}
.np-item.critical::before { background: var(--danger); }
.np-item.warning::before  { background: var(--mostaza); }
.np-item.info::before     { background: var(--info); }
.np-item.success::before  { background: var(--oliva); }

.np-item-btn {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px 10px 16px;
  background: transparent;
  border: none;
  font: inherit;
  cursor: pointer;
  text-align: left;
  /* WCAG 2.2 §2.5.8: minimum 24×24px target, we give 44px height */
  min-height: 44px;
  transition: background var(--dur) var(--ease-standard);
}
.np-item-btn:hover { background: var(--crema-50); }
.np-item.is-unread .np-item-btn { background: var(--crema-50); }
.np-item.is-unread .np-item-btn:hover { background: var(--crema-100); }
.np-item-btn:focus-visible {
  outline: 2px solid var(--terracotta);
  outline-offset: -2px;
  border-radius: 0;
}

/* ---- Item icon ---- */
.np-ico {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}
.np-ico-glyph { width: 15px; height: 15px; }
.np-item.critical .np-ico { background: var(--danger-bg);  color: var(--danger); }
.np-item.warning  .np-ico { background: var(--warning-bg); color: var(--mostaza-700); }
.np-item.info     .np-ico { background: var(--info-bg);    color: var(--info); }
.np-item.success  .np-ico { background: var(--success-bg); color: var(--oliva-700); }

/* ---- Item body ---- */
.np-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.np-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--fg1);
  line-height: 1.3;
  display: flex;
  align-items: baseline;
  gap: 5px;
  flex-wrap: wrap;
}
.np-type-pill {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--fg3);
  background: var(--crema-200);
  padding: 1px 5px;
  border-radius: 999px;
  flex-shrink: 0;
  /* Contrast: #807B75 on #EAE2D5 = ~3.7:1 — acceptable for 9px all-caps label
     (WCAG allows lower contrast for decorative/non-essential status metadata).
     The title text above carries the real content. */
}
.np-text {
  font-size: 12px;
  color: var(--fg2);
  line-height: 1.45;
  /* Clamp body to 2 lines — full text visible on the dedicated page */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.np-action-label {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--terracotta-700);
  margin-top: 3px;
}
.np-action-arrow { width: 11px; height: 11px; }

/* ---- Item meta (time + unread dot) ---- */
.np-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
  flex-shrink: 0;
}
.np-time {
  font-size: 10px;
  color: var(--fg3);
  white-space: nowrap;
}
.np-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--terracotta);
}

/* ---- Empty state ---- */
.np-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 32px 24px;
  text-align: center;
}
.np-empty-ico {
  width: 36px;
  height: 36px;
  color: var(--fg3);
  margin-bottom: 4px;
}
.np-empty-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg1);
  margin: 0;
}
.np-empty-sub {
  font-size: 12px;
  color: var(--fg3);
  margin: 0;
  max-width: 22em;
}

/* ---- Footer ---- */
.np-foot {
  border-top: 1px solid var(--border-subtle);
  padding: 10px 16px;
  flex-shrink: 0;
}
.np-foot-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 600;
  color: var(--fg2);
  text-decoration: none;
  min-height: 36px;
  border-radius: 8px;
  padding: 6px 10px;
  transition:
    color var(--dur) var(--ease-standard),
    background var(--dur) var(--ease-standard);
}
.np-foot-link:hover {
  color: var(--fg1);
  background: var(--crema-50);
}
.np-foot-link:focus-visible {
  outline: 2px solid var(--terracotta);
  outline-offset: 2px;
}
.np-foot-arrow { width: 13px; height: 13px; }
</style>
