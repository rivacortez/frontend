<script setup lang="ts">
// /app/cierre — HU-04-08 · Cierre Z (caja). Muestra el turno abierto (ventas desde
// el último cierre, agregadas por método de pago), permite cerrarlo y lista el
// historial. Es info de gestión: solo owner/manager (el backend 403ea a staff).
definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Cierre de caja — GastronomIA' })

const { user } = useUserSession()
const toast = useToast()

const canView = computed(() => user.value?.role === 'owner' || user.value?.role === 'manager')

const { data: preview, isLoading: loadingPreview } = useCashClosePreview()
const { data: closes, isLoading: loadingCloses } = useCashCloses()
const { mutateAsync: doClose, isLoading: closing } = useDoCashClose()

const METHODS: Array<{ key: 'cash' | 'card' | 'yape' | 'plin', label: string, icon: string }> = [
  { key: 'cash', label: 'Efectivo', icon: 'i-lucide-banknote' },
  { key: 'card', label: 'Tarjeta', icon: 'i-lucide-credit-card' },
  { key: 'yape', label: 'Yape', icon: 'i-lucide-smartphone' },
  { key: 'plin', label: 'Plin', icon: 'i-lucide-smartphone' },
]

const hasSales = computed(() => (preview.value?.salesCount ?? 0) > 0)
const confirmOpen = ref(false)

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })
}
function money(s: string | null | undefined): string {
  return formatPEN(Number(s ?? 0))
}

async function confirmClose(): Promise<void> {
  if (closing.value) return
  try {
    const res = await doClose()
    confirmOpen.value = false
    toast.add({
      title: 'Turno cerrado (Cierre Z)',
      description: `${res.salesCount} venta(s) · ${money(res.totalGross)}`,
      icon: 'i-lucide-badge-check',
    })
  }
  catch (e) {
    const err = e as { data?: { message?: string }, statusMessage?: string }
    toast.add({
      title: 'No se pudo cerrar el turno',
      description: err.data?.message ?? err.statusMessage ?? 'Intenta de nuevo',
      icon: 'i-lucide-alert-triangle',
      color: 'error',
    })
  }
}
</script>

<template>
  <div class="cz-screen">
    <UiScreenHeader title="Cierre de caja" subtitle="Cierre Z del turno" back="/app/menu" />

    <!-- Sin permiso (staff) -->
    <UiEmptyState
      v-if="!canView"
      icon="i-lucide-lock"
      title="Sin acceso al cierre de caja"
      subtitle="El arqueo y el Cierre Z son información de gestión: solo el propietario y el encargado pueden verlos."
    />

    <template v-else>
      <div class="cz-layout">
        <!-- Turno abierto (preview, no persiste) — columna izquierda -->
        <section class="cz-summary" aria-label="Turno abierto">
          <header class="cz-sum-head">
            <span class="cz-eyebrow">
              <span class="cz-live" :class="{ idle: !hasSales }" aria-hidden="true" />
              Turno abierto
            </span>
            <span class="cz-since">
              {{ hasSales ? `Desde ${fmtDateTime(preview?.openSince ?? preview?.periodStart)}` : 'Sin ventas en este turno' }}
            </span>
          </header>

          <div class="cz-total">
            <span class="cur">S/</span>
            <span class="num">{{ Number(preview?.totalGross ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2 }) }}</span>
          </div>
          <p class="cz-total-label">
            Total bruto · <b>{{ preview?.salesCount ?? 0 }}</b> venta(s)<template v-if="(preview?.voidCount ?? 0) > 0"> · {{ preview?.voidCount }} anulada(s)</template>
          </p>

          <div class="cz-methods-head">Desglose por método</div>
          <div class="cz-methods" role="list">
            <div v-for="m in METHODS" :key="m.key" class="cz-method" role="listitem">
              <span class="cz-method-ico"><UIcon :name="m.icon" /></span>
              <div class="cz-method-body">
                <span class="cz-method-lbl">{{ m.label }}</span>
                <span class="cz-method-val">{{ money(preview?.byMethod?.[m.key]) }}</span>
              </div>
            </div>
          </div>

          <button class="cz-close-btn" :disabled="!hasSales || loadingPreview" @click="confirmOpen = true">
            <UIcon name="i-lucide-lock" /> Cerrar turno (Z)
          </button>
          <p v-if="!hasSales" class="cz-hint">No hay ventas para cerrar todavía.</p>
        </section>

        <!-- Historial — columna derecha -->
        <section class="cz-history" aria-label="Cierres anteriores">
          <header class="cz-history-head">
            <h2 class="cz-history-title">Cierres anteriores</h2>
            <span v-if="closes && closes.length" class="cz-history-count">{{ closes.length }}</span>
          </header>
          <div v-if="loadingCloses" class="cz-muted">Cargando…</div>
          <UiEmptyState
            v-else-if="!closes || closes.length === 0"
            icon="i-lucide-archive"
            title="Aún no hay cierres"
            subtitle="Cuando cierres el turno, el Cierre Z quedará registrado aquí."
          />
          <ul v-else class="cz-list">
            <li v-for="c in closes" :key="c.id" class="cz-item">
              <div class="cz-item-main">
                <span class="cz-item-date">{{ fmtDateTime(c.closedAt) }}</span>
                <span class="cz-item-sub">{{ c.salesCount }} venta(s)<template v-if="c.voidCount > 0"> · {{ c.voidCount }} anulada(s)</template></span>
              </div>
              <span class="cz-item-total">{{ money(c.totalGross) }}</span>
            </li>
          </ul>
        </section>
      </div>
    </template>

    <!-- Confirmar cierre -->
    <UiBottomSheet
      v-model="confirmOpen"
      title="Cerrar turno (Cierre Z)"
      subtitle="Es definitivo: registra el total del turno y abre uno nuevo."
    >
      <div class="cz-confirm">
        <div class="cz-confirm-row"><span>Ventas</span><b>{{ preview?.salesCount ?? 0 }}</b></div>
        <div class="cz-confirm-row total"><span>Total bruto</span><b>{{ money(preview?.totalGross) }}</b></div>
      </div>
      <template #cta>
        <button class="cz-confirm-btn" :disabled="closing" @click="confirmClose">
          <UIcon :name="closing ? 'i-lucide-loader-circle' : 'i-lucide-check'" :class="{ spin: closing }" />
          {{ closing ? 'Cerrando…' : 'Confirmar Cierre Z' }}
        </button>
      </template>
    </UiBottomSheet>
  </div>
</template>

<style scoped>
.cz-screen { padding: 0 clamp(20px, 2.6vw, 38px) 32px; }

/* ===== Layout: 2 columnas en desktop (resumen + historial), apila en mobile ===== */
.cz-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  margin-top: 18px;
  align-items: start;
}
@media (min-width: 1024px) {
  .cz-layout {
    grid-template-columns: minmax(380px, 440px) minmax(0, 1fr);
    gap: 24px;
  }
}

/* ===== Resumen del turno: panel editorial cálido (focal) ===== */
.cz-summary {
  border-radius: 18px;
  padding: 22px 22px 20px;
  background:
    radial-gradient(120% 80% at 100% 0%, rgba(201, 106, 67, 0.08), transparent 54%),
    linear-gradient(180deg, var(--pure-white) 0%, var(--crema-50) 100%);
  border: 1px solid var(--border-subtle);
  box-shadow:
    0 1px 2px rgba(26, 26, 26, 0.04),
    0 14px 28px -18px rgba(201, 106, 67, 0.28),
    0 20px 40px -26px rgba(26, 26, 26, 0.18);
}
@media (min-width: 1024px) {
  .cz-summary { position: sticky; top: 16px; }
}

.cz-sum-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.cz-eyebrow {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
  color: var(--fg3);
}
.cz-live {
  width: 7px; height: 7px; border-radius: 50%; background: var(--oliva); flex-shrink: 0;
  box-shadow: 0 0 0 0 rgba(110, 123, 97, 0.5);
  animation: czLive 2.4s var(--ease-standard) infinite;
}
.cz-live.idle { background: var(--border-strong); animation: none; }
@keyframes czLive {
  0%, 100% { box-shadow: 0 0 0 0 rgba(110, 123, 97, 0.45); }
  50% { box-shadow: 0 0 0 4px rgba(110, 123, 97, 0); }
}
.cz-since { font-size: 11.5px; color: var(--fg3); text-align: right; }

.cz-total {
  margin-top: 16px;
  display: flex; align-items: baseline; gap: 7px;
}
.cz-total .cur { font-size: 22px; font-weight: 500; color: var(--fg3); }
.cz-total .num {
  font-size: clamp(40px, 4.4vw, 52px); font-weight: 600; letter-spacing: -0.04em;
  line-height: 1; color: var(--fg1); font-variant-numeric: tabular-nums;
}
.cz-total-label { font-size: 12.5px; color: var(--fg3); margin: 6px 0 0; }
.cz-total-label b { color: var(--fg2); font-variant-numeric: tabular-nums; }

.cz-methods-head {
  font-size: 10px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
  color: var(--fg3);
  margin: 20px 0 10px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}
.cz-methods { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.cz-method {
  display: flex; align-items: center; gap: 10px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 10px 12px;
}
.cz-method-ico {
  width: 30px; height: 30px; flex-shrink: 0; border-radius: 9px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--crema-100); color: var(--fg2);
}
.cz-method-ico .iconify { width: 16px; height: 16px; }
.cz-method-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.cz-method-lbl { font-size: 11.5px; color: var(--fg3); }
.cz-method-val {
  font-size: 14.5px; font-weight: 600; color: var(--fg1);
  font-variant-numeric: tabular-nums;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.cz-close-btn {
  width: 100%;
  margin-top: 18px;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--espresso); color: var(--crema-100);
  border: none; border-radius: 12px;
  padding: 14px; font: inherit; font-size: 15px; font-weight: 600;
  cursor: pointer;
  transition: background var(--dur) var(--ease-standard), opacity var(--dur) var(--ease-standard);
}
.cz-close-btn:hover:not(:disabled) { background: var(--espresso-800); }
.cz-close-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.cz-close-btn .iconify { width: 17px; height: 17px; }
.cz-hint { text-align: center; font-size: 12px; color: var(--fg3); margin: 8px 0 0; }

/* ===== Historial: panel propio ===== */
.cz-history {
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 18px;
  padding: 18px;
}
.cz-history-head { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; }
.cz-history-title {
  font-size: 11px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase;
  color: var(--fg3); margin: 0;
}
.cz-history-count {
  font-size: 11px; font-weight: 700; color: var(--crema-100);
  background: var(--espresso); border-radius: 999px;
  min-width: 18px; height: 18px; padding: 0 6px;
  display: inline-flex; align-items: center; justify-content: center;
  font-variant-numeric: tabular-nums;
}
.cz-muted { font-size: 13px; color: var(--fg3); padding: 12px 2px; }
.cz-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.cz-item {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: var(--crema-50);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 12px 14px;
  transition: border-color var(--dur) var(--ease-standard), background var(--dur) var(--ease-standard);
}
.cz-item:hover { background: var(--pure-white); border-color: var(--border); }
.cz-item-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cz-item-date { font-size: 13.5px; font-weight: 600; color: var(--fg1); }
.cz-item-sub { font-size: 11.5px; color: var(--fg3); }
.cz-item-total { font-size: 15px; font-weight: 600; color: var(--fg1); font-variant-numeric: tabular-nums; white-space: nowrap; }

@media (prefers-reduced-motion: reduce) {
  .cz-live { animation: none; }
}

.cz-confirm { display: flex; flex-direction: column; gap: 6px; padding: 4px 0 8px; }
.cz-confirm-row { display: flex; justify-content: space-between; font-size: 14px; color: var(--fg2); padding: 4px 0; }
.cz-confirm-row.total { border-top: 1px solid var(--border-subtle); margin-top: 4px; padding-top: 10px; font-size: 15px; }
.cz-confirm-row b { color: var(--fg1); font-variant-numeric: tabular-nums; }
.cz-confirm-btn {
  width: 100%;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--espresso); color: var(--crema-100);
  border: none; border-radius: 12px;
  padding: 14px; font: inherit; font-size: 15px; font-weight: 600;
  cursor: pointer;
}
.cz-confirm-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.cz-confirm-btn .iconify { width: 17px; height: 17px; }
.spin { animation: spinAnim 0.9s linear infinite; }
@keyframes spinAnim { to { transform: rotate(360deg); } }
</style>
