<script setup lang="ts">
useSeoMeta({ title: 'Configura tu local — GastronomIA' })

const store = useOnboardingStore()

if (!store.account.email) {
  await navigateTo('/registro')
}

const skipConfirm = ref(false)

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  yape: 'Yape',
  plin: 'Plin',
  transferencia: 'Transferencia',
  sodexo: 'Sodexo',
}

function addArea(): void {
  store.setup.areas.push({ id: `a-${Date.now()}`, name: '', tables: 2 })
}

function removeArea(id: string): void {
  store.setup.areas = store.setup.areas.filter(a => a.id !== id)
}

function skip(): void {
  store.applySetupDefaults()
  skipConfirm.value = false
  void navigateTo('/registro/importar')
}

function next(): void {
  void navigateTo('/registro/importar')
}
</script>

<template>
  <OnboardingStepShell
    :step="4"
    title="Configura tu local"
    subtitle="Zonas, horario y métodos de pago. Puedes cambiar todo después."
    back="/registro/restaurante"
  >
    <!-- Zonas -->
    <div class="su-block">
      <div class="field-label">
        <span>Zonas y mesas</span>
        <span class="hint">{{ store.totalTables }} mesas en total</span>
      </div>
      <div class="su-areas">
        <div v-for="a in store.setup.areas" :key="a.id" class="su-area">
          <input v-model="a.name" type="text" placeholder="Nombre de zona" class="su-area-name">
          <div class="su-area-qty">
            <button :disabled="a.tables <= 1" aria-label="Menos mesas" @click="a.tables -= 1"><UIcon name="i-lucide-minus" /></button>
            <b>{{ a.tables }}</b>
            <button :disabled="a.tables >= 30" aria-label="Más mesas" @click="a.tables += 1"><UIcon name="i-lucide-plus" /></button>
          </div>
          <button v-if="store.setup.areas.length > 1" class="su-area-del" aria-label="Eliminar zona" @click="removeArea(a.id)">
            <UIcon name="i-lucide-x" />
          </button>
        </div>
        <button class="su-add" @click="addArea"><UIcon name="i-lucide-plus" /> Agregar zona</button>
      </div>
    </div>

    <!-- Horario -->
    <div class="su-block">
      <div class="field-label"><span>Horario habitual</span></div>
      <div class="su-hours">
        <label class="su-time">
          <span>Abre</span>
          <input v-model="store.setup.openTime" type="time">
        </label>
        <span class="su-time-sep" aria-hidden="true">—</span>
        <label class="su-time">
          <span>Cierra</span>
          <input v-model="store.setup.closeTime" type="time">
        </label>
      </div>
    </div>

    <!-- Pagos -->
    <div class="su-block">
      <div class="field-label"><span>Métodos de pago</span></div>
      <div class="su-payments">
        <button
          v-for="(enabled, key) in store.setup.payments"
          :key="key"
          class="su-pay"
          :class="{ on: enabled }"
          role="checkbox"
          :aria-checked="enabled"
          @click="store.setup.payments[key] = !enabled"
        >
          <UIcon :name="enabled ? 'i-lucide-check' : 'i-lucide-plus'" />
          {{ PAYMENT_LABELS[key] ?? key }}
        </button>
      </div>
    </div>

    <template #cta>
      <UButton size="xl" block trailing-icon="i-lucide-arrow-right" @click="next">
        Continuar
      </UButton>
      <UButton size="xl" block color="neutral" variant="ghost" @click="skipConfirm = true">
        Saltar por ahora
      </UButton>
    </template>
  </OnboardingStepShell>

  <!-- Modal saltar -->
  <Teleport to="body">
    <div v-if="skipConfirm" class="su-modal-overlay" @click="skipConfirm = false">
      <div class="su-modal" role="alertdialog" @click.stop>
        <div class="su-modal-ico"><UIcon name="i-lucide-wand-2" /></div>
        <h3>¿Saltar la configuración?</h3>
        <p>Aplicaremos valores típicos (1 salón con 10 mesas, IGV 18 %, pagos comunes). Puedes ajustarlo luego en Ajustes.</p>
        <div class="su-modal-actions">
          <button class="btn btn-primary btn-lg btn-block" @click="skip">Usar valores típicos</button>
          <button class="btn btn-ghost btn-block" @click="skipConfirm = false">Volver</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.su-block { margin-bottom: 22px; }
.su-areas { display: flex; flex-direction: column; gap: 8px; }
.su-area {
  display: flex; align-items: center; gap: 8px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 8px 10px;
}
.su-area-name {
  flex: 1; min-width: 0;
  background: transparent; border: none; outline: none;
  font: inherit; font-size: 14px; font-weight: 600;
  color: var(--fg1);
}
.su-area-name::placeholder { color: var(--fg3); font-weight: 400; }
.su-area-qty {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--crema-100);
  border-radius: 10px;
  padding: 3px;
}
.su-area-qty button {
  width: 28px; height: 28px; border-radius: 8px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  color: var(--fg2);
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.su-area-qty button:disabled { opacity: 0.35; }
.su-area-qty button .iconify { width: 12px; height: 12px; }
.su-area-qty b {
  min-width: 24px; text-align: center;
  font-size: 13px; font-variant-numeric: tabular-nums;
}
.su-area-del {
  width: 28px; height: 28px; border-radius: 8px;
  background: transparent; border: none;
  color: var(--fg3);
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.su-area-del:hover { color: var(--danger); }
.su-area-del .iconify { width: 14px; height: 14px; }
.su-add {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  font: inherit; font-size: 13px; font-weight: 600;
  background: transparent;
  border: 1.5px dashed var(--border);
  color: var(--fg2);
  padding: 11px;
  border-radius: 12px;
  cursor: pointer;
}
.su-add:hover { border-color: var(--terracotta); color: var(--terracotta-700); }
.su-add .iconify { width: 14px; height: 14px; }

.su-hours { display: flex; align-items: flex-end; gap: 10px; }
.su-time { display: flex; flex-direction: column; gap: 3px; flex: 1; }
.su-time span {
  font-size: 9.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--fg3);
}
.su-time input {
  background: var(--pure-white);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit; font-size: 15px; font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--fg1);
  outline: none;
}
.su-time input:focus { border-color: var(--terracotta); }
.su-time-sep { color: var(--fg3); padding-bottom: 12px; }

.su-payments { display: flex; flex-wrap: wrap; gap: 6px; }
.su-pay {
  display: inline-flex; align-items: center; gap: 6px;
  font: inherit; font-size: 13px; font-weight: 600;
  background: var(--pure-white);
  border: 1px solid var(--border);
  color: var(--fg2);
  padding: 8px 13px;
  border-radius: 999px;
  cursor: pointer;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard), border-color var(--dur) var(--ease-standard);
}
.su-pay.on { background: var(--oliva); color: var(--crema-100); border-color: var(--oliva); }
.su-pay .iconify { width: 13px; height: 13px; }
</style>

<style>
.su-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(26, 26, 26, 0.55);
  z-index: 60;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.su-modal {
  background: var(--pure-white);
  border-radius: 16px;
  padding: 22px 20px 18px;
  width: 100%;
  max-width: 330px;
}
.su-modal-ico {
  width: 44px; height: 44px; border-radius: 12px;
  background: var(--terracotta-100); color: var(--terracotta-700);
  display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: 12px;
}
.su-modal-ico .iconify { width: 22px; height: 22px; }
.su-modal h3 { font-size: 17px; font-weight: 600; color: var(--fg1); margin: 0 0 6px; }
.su-modal p { font-size: 13.5px; line-height: 1.5; color: var(--fg2); margin: 0 0 16px; }
.su-modal-actions { display: flex; flex-direction: column; gap: 8px; }
</style>
