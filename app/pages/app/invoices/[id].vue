<script setup lang="ts">
definePageMeta({ layout: 'app' })

const route = useRoute()
const { data: sale, refresh } = useSale(() => String(route.params.id))
const toast = useToast()
const { user } = useUserSession()
const voidSale = useVoidSale()

useSeoMeta({ title: () => sale.value ? `${sale.value.serie}-${sale.value.number} — GastronomIA` : 'Comprobante — GastronomIA' })

// HU-04-07 · Anular comprobante (manager/owner). El backend exige razón y rol
// (CASL 'update' 'Sale'); staff no ve el botón (y el BFF igual devolvería 403).
const canVoid = computed(() =>
  !!sale.value && sale.value.status === 'issued'
  && (user.value?.role === 'owner' || user.value?.role === 'manager'),
)
const voidConfirm = ref(false)
const voidReason = ref('')
const voiding = ref(false)

async function confirmVoid(): Promise<void> {
  if (!sale.value || !voidReason.value.trim() || voiding.value) return
  voiding.value = true
  try {
    await voidSale.mutateAsync({ id: sale.value.id, reason: voidReason.value.trim() })
    voidConfirm.value = false
    toast.add({ title: 'Comprobante anulado', icon: 'i-lucide-ban' })
    await refresh()
  }
  catch (err) {
    toast.add({ title: 'No se pudo anular', description: errorMessage(err, 'Intenta de nuevo.'), icon: 'i-lucide-alert-triangle', color: 'error' })
  }
  finally {
    voiding.value = false
  }
}

const dateLabel = computed(() => {
  if (!sale.value) return ''
  return new Intl.DateTimeFormat('es-PE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Lima',
  }).format(new Date(sale.value.date))
})

const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  yape: 'Yape',
  plin: 'Plin',
}

function share(): void {
  toast.add({ title: 'Enviando comprobante por WhatsApp…', icon: 'i-lucide-send' })
}
function print(): void {
  toast.add({ title: 'Enviado a impresora térmica', icon: 'i-lucide-printer' })
}
</script>

<template>
  <div class="ivd-screen">
    <UiScreenHeader
      :title="sale ? `${sale.serie}-${sale.number}` : 'Comprobante'"
      :subtitle="sale ? (sale.docType === 'boleta' ? 'Boleta de venta electrónica' : 'Factura electrónica') : ''"
      back="/app/invoices"
    />

    <template v-if="sale">
      <!-- Ticket -->
      <article class="ticket" :class="{ void: sale.status === 'void' }">
        <div v-if="sale.status === 'void'" class="ticket-void-stamp" aria-label="Comprobante anulado">ANULADA</div>

        <header class="ticket-head">
          <img src="/img/logo.svg" alt="" width="32" height="32">
          <div class="ticket-biz">Motif Restobar Karaoke</div>
          <div class="ticket-meta">RUC 20612345678 · San Juan de Lurigancho</div>
          <div class="ticket-doc">
            {{ sale.docType === 'boleta' ? 'BOLETA DE VENTA' : 'FACTURA' }} ELECTRÓNICA
            <b>{{ sale.serie }}-{{ sale.number }}</b>
          </div>
        </header>

        <div class="ticket-info">
          <div class="row"><span>Fecha</span><b>{{ dateLabel }}</b></div>
          <div v-if="sale.tableLabel" class="row"><span>Mesa</span><b>{{ sale.tableLabel }}</b></div>
          <div v-if="sale.customer" class="row"><span>Cliente</span><b>{{ sale.customer }}</b></div>
          <div v-if="sale.customerDoc" class="row"><span>{{ sale.docType === 'boleta' ? 'DNI' : 'RUC' }}</span><b>{{ sale.customerDoc }}</b></div>
          <div class="row"><span>Pago</span><b>{{ METHOD_LABEL[sale.method] }}</b></div>
        </div>

        <div class="ticket-divider" aria-hidden="true" />

        <div class="ticket-items">
          <div v-for="(item, i) in sale.items" :key="i" class="ticket-item">
            <span class="qty">{{ item.qty }}×</span>
            <span class="name">{{ item.name }}</span>
            <span class="total">{{ formatPEN(item.total) }}</span>
          </div>
        </div>

        <div class="ticket-divider" aria-hidden="true" />

        <div class="ticket-totals">
          <div class="row"><span>Subtotal</span><span>{{ formatPEN(sale.subtotal) }}</span></div>
          <div class="row"><span>IGV (18 %)</span><span>{{ formatPEN(sale.igv) }}</span></div>
          <div class="row grand"><span>Total</span><span>{{ formatPEN(sale.total) }}</span></div>
        </div>

        <footer class="ticket-foot">
          Gracias por tu visita ♥
        </footer>
      </article>

      <!-- Acciones -->
      <div class="ivd-actions">
        <button class="btn btn-ghost" @click="print">
          <UIcon name="i-lucide-printer" /> Imprimir
        </button>
        <button class="btn btn-primary" @click="share">
          <UIcon name="i-lucide-send" /> Enviar al cliente
        </button>
      </div>

      <!-- Anular (HU-04-07, solo manager/owner y si está emitido) -->
      <button v-if="canVoid" class="ivd-void-btn" @click="voidReason = ''; voidConfirm = true">
        <UIcon name="i-lucide-ban" /> Anular comprobante
      </button>
    </template>

    <UiEmptyState
      v-else
      icon="i-lucide-receipt"
      title="Comprobante no encontrado"
      subtitle="Puede haber sido eliminado."
    >
      <UButton to="/app/invoices" variant="outline" color="neutral" icon="i-lucide-arrow-left">Volver</UButton>
    </UiEmptyState>

    <!-- Confirmación de anulación -->
    <Teleport to="body">
      <div v-if="voidConfirm" class="ivd-modal-overlay" role="presentation" @click="voidConfirm = false">
        <div class="ivd-modal" role="alertdialog" aria-modal="true" aria-label="Anular comprobante" @click.stop>
          <div class="ivd-modal-ico" aria-hidden="true"><UIcon name="i-lucide-ban" /></div>
          <h3 class="ivd-modal-title">Anular {{ sale?.serie }}-{{ sale?.number }}</h3>
          <p class="ivd-modal-text">El comprobante quedará marcado como anulado. Indica el motivo — quedará registrado para auditoría.</p>
          <textarea
            v-model="voidReason"
            class="ivd-modal-textarea"
            placeholder="Motivo de la anulación…"
            aria-label="Motivo de la anulación"
            maxlength="140"
          />
          <div class="ivd-modal-actions">
            <button class="btn btn-danger btn-lg btn-block" :disabled="!voidReason.trim() || voiding" @click="confirmVoid">
              <UIcon :name="voiding ? 'i-lucide-loader-2' : 'i-lucide-ban'" :class="{ spin: voiding }" />
              {{ voiding ? 'Anulando…' : 'Sí, anular' }}
            </button>
            <button class="btn btn-ghost btn-block" @click="voidConfirm = false">Cancelar</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.ivd-screen {
  max-width: 480px;
  margin: 0 auto;
  padding-bottom: 24px;
}

.ticket {
  position: relative;
  margin: 4px 20px 16px;
  background: var(--pure-white);
  border-radius: 4px 4px 16px 16px;
  padding: 22px 20px 18px;
  box-shadow: var(--shadow);
  overflow: hidden;
}
/* borde dentado superior tipo ticket */
.ticket::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0;
  height: 6px;
  background:
    radial-gradient(circle at 6px -2px, transparent 6px, var(--crema) 6px);
  background-size: 14px 8px;
  transform: rotate(180deg);
}
.ticket.void { opacity: 0.75; }
.ticket-void-stamp {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%) rotate(-18deg);
  font-size: 44px; font-weight: 800; letter-spacing: 0.1em;
  color: rgba(179, 58, 42, 0.25);
  border: 4px solid rgba(179, 58, 42, 0.25);
  border-radius: 10px;
  padding: 4px 18px;
  pointer-events: none;
  z-index: 2;
}
.ticket-head { text-align: center; }
.ticket-biz { font-size: 16px; font-weight: 700; color: var(--fg1); margin-top: 8px; }
.ticket-meta { font-size: 11px; color: var(--fg3); margin-top: 2px; }
.ticket-doc {
  font-family: var(--font-mono);
  font-size: 12px; color: var(--fg2);
  margin-top: 10px;
  display: flex; flex-direction: column; gap: 2px;
}
.ticket-doc b { font-size: 15px; color: var(--fg1); }

.ticket-info { margin-top: 16px; }
.ticket-info .row {
  display: flex; justify-content: space-between;
  font-size: 12.5px; color: var(--fg3);
  padding: 2px 0;
}
.ticket-info .row b { color: var(--fg1); font-weight: 600; text-align: right; }

.ticket-divider {
  border-top: 1.5px dashed var(--border);
  margin: 14px 0;
}

.ticket-items { display: flex; flex-direction: column; gap: 8px; }
.ticket-item {
  display: flex; align-items: baseline; gap: 8px;
  font-size: 13.5px;
}
.ticket-item .qty {
  font-family: var(--font-mono);
  color: var(--fg3);
  flex-shrink: 0;
  min-width: 26px;
}
.ticket-item .name { flex: 1; color: var(--fg1); font-weight: 500; }
.ticket-item .total {
  font-family: var(--font-mono);
  color: var(--fg1); font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.ticket-totals .row {
  display: flex; justify-content: space-between;
  font-size: 13px; color: var(--fg2);
  padding: 2px 0;
  font-variant-numeric: tabular-nums;
}
.ticket-totals .row.grand {
  font-size: 17px; font-weight: 700; color: var(--fg1);
  padding-top: 8px;
}
.ticket-foot {
  text-align: center;
  font-family: var(--font-serif);
  font-style: italic;
  font-size: 13px; color: var(--fg3);
  margin-top: 16px;
}

.ivd-actions {
  display: grid; grid-template-columns: auto 1fr;
  gap: 10px;
  padding: 0 20px;
}
.ivd-actions .btn { min-height: 48px; border-radius: 12px; justify-content: center; font-size: 14px; }

.ivd-void-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  margin: 12px 20px 0;
  width: calc(100% - 40px);
  background: transparent;
  border: 1px solid var(--danger-bg);
  color: var(--danger);
  font: inherit; font-size: 13px; font-weight: 600;
  min-height: 44px; border-radius: 12px;
  cursor: pointer;
  transition: background var(--dur) var(--ease-standard);
}
.ivd-void-btn:hover { background: var(--danger-bg); }
.ivd-void-btn .iconify { width: 15px; height: 15px; }
</style>

<style>
/* Modal de anulación teleportado a body (sin scope) */
.ivd-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(26, 26, 26, 0.55);
  z-index: 60;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  animation: ivdFade 200ms ease;
}
@keyframes ivdFade { from { opacity: 0; } to { opacity: 1; } }
.ivd-modal {
  background: var(--pure-white);
  border-radius: 16px;
  padding: 22px 20px 18px;
  width: 100%;
  max-width: 340px;
  text-align: left;
  animation: ivdModalIn 280ms var(--ease-emphasis);
}
@keyframes ivdModalIn {
  from { transform: scale(0.92); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.ivd-modal-ico {
  width: 44px; height: 44px; border-radius: 12px;
  background: var(--danger-bg); color: var(--danger);
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 12px;
}
.ivd-modal-ico .iconify { width: 22px; height: 22px; }
.ivd-modal-title { font-size: 17px; font-weight: 600; color: var(--fg1); letter-spacing: -0.01em; margin: 0 0 6px; }
.ivd-modal-text { font-size: 13.5px; line-height: 1.45; color: var(--fg2); margin: 0 0 12px; }
.ivd-modal-textarea {
  width: 100%; min-height: 64px; resize: none;
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit; font-size: 13.5px; color: var(--fg1);
  outline: none;
  margin-bottom: 14px;
  transition: border-color var(--dur), box-shadow var(--dur);
}
.ivd-modal-textarea:focus { border-color: var(--danger); box-shadow: 0 0 0 3px rgba(179, 58, 42, 0.16); }
.ivd-modal-actions { display: flex; flex-direction: column; gap: 8px; }
.ivd-modal .spin { animation: ivdSpin 0.9s linear infinite; }
@keyframes ivdSpin { to { transform: rotate(360deg); } }
</style>
