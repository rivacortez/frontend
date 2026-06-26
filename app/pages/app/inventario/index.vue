<script setup lang="ts">
import type { Ingredient } from '#shared/types/domain'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Inventario — GastronomIA' })

definePageHeader(() => ({
  title: 'Inventario',
  subtitle: 'Controlá qué tenés, registrá movimientos y reponé lo que falta',
}))

const { data: ingredients } = useIngredients()
const { data: shopping } = useShoppingList()
const toast = useToast()

const query = ref('')
const cat = ref('Todos')

const { mutateAsync: addShopping } = useAddShoppingItem()
// Estado real: qué insumos ya están en la Lista de Compras (no un toggle local).
const inShopping = computed(() => new Set((shopping.value ?? []).map(s => s.ingredientId)))

type StockStatus = 'ok' | 'low' | 'crit'

function statusOf(i: Ingredient): StockStatus {
  // El backend (E05) ya calcula el estado; lo usamos si vino, con fallback local.
  if (i.status) return i.status === 'critical' ? 'crit' : i.status
  if (i.minStock <= 0) return 'ok'
  const ratio = i.stock / i.minStock
  if (ratio < 1) return 'crit'
  if (ratio < 1.5) return 'low'
  return 'ok'
}

const STATUS_LABEL: Record<StockStatus, string> = { ok: 'OK', low: 'Bajo', crit: 'Crítico' }

// Emoji por insumo — iconografía de CONTENIDO (comida), reconocible y cálida.
const EMOJI_BY_NAME: Record<string, string> = {
  'Limón Sutil': '🍋',
  'Aceite de Oliva': '🫒',
  'Aceite vegetal': '🫗',
  'Cilantro': '🌿',
  'Pescado Lenguado': '🐟',
  'Mariscos Mixtos': '🦐',
  'Camarones': '🦐',
  'Lomo de Res': '🥩',
  'Pollo Entero': '🍗',
  'Cebolla Roja': '🧅',
  'Tomate': '🍅',
  'Papa Amarilla': '🥔',
  'Camote': '🍠',
  'Choclo Desgranado': '🌽',
  'Ají Limo': '🌶️',
  'Ají Amarillo': '🌶️',
  'Ají amarillo': '🌶️',
  'Ají limo': '🌶️',
  'Arroz': '🍚',
  'Arroz Extra': '🌾',
  'Pisco Quebranta': '🍾',
  'Ron Blanco': '🥃',
  'Maracuyá': '🥭',
  'Leche Evaporada': '🥛',
  'Queso Fresco': '🧀',
}
const EMOJI_BY_CAT: Record<string, string> = {
  'Pescados y mariscos': '🐟',
  'Pescados y Mariscos': '🐟',
  'Verduras y frutas': '🥬',
  'Verduras': '🥬',
  'Carnes': '🥩',
  'Abarrotes': '🌾',
  'Bebidas': '🥤',
  'Licores': '🍾',
  'Lácteos': '🥛',
  'Hierbas': '🌿',
}
const emojiOf = (i: Ingredient): string => EMOJI_BY_NAME[i.name] ?? EMOJI_BY_CAT[i.category] ?? '🧺'

const all = computed(() => ingredients.value ?? [])

const critical = computed(() => all.value.filter(i => statusOf(i) === 'crit'))

const categories = computed(() => {
  const cats: string[] = ['Todos']
  for (const i of all.value) {
    if (!cats.includes(i.category)) cats.push(i.category)
  }
  return cats
})

const filtered = computed(() =>
  all.value.filter((i) => {
    if (cat.value !== 'Todos' && cat.value !== 'sin-costo' && i.category !== cat.value) return false
    if (cat.value === 'sin-costo' && i.unitCost > 0) return false
    const q = query.value.trim().toLowerCase()
    return !q || i.name.toLowerCase().includes(q)
  }),
)

const noCostCount = computed(() => all.value.filter(i => i.unitCost <= 0).length)
const shoppingTotal = computed(() =>
  (shopping.value ?? []).filter(s => !s.checked).reduce((sum, s) => sum + s.estimatedCost, 0),
)

// ── Métricas del aside (complementarias, derivadas de la data ya cargada) ──
// Valor inmovilizado en inventario: Σ stock · costo unitario (los sin costo suman 0).
const totalValue = computed(() =>
  all.value.reduce((sum, i) => sum + i.stock * (i.unitCost > 0 ? i.unitCost : 0), 0),
)
// Cobertura de costos: % de insumos con costo unitario cargado.
const withCostPct = computed(() => {
  if (!all.value.length) return 0
  return Math.round(((all.value.length - noCostCount.value) / all.value.length) * 100)
})

function fmtStock(i: Ingredient): string {
  if (i.unit === 'kg' && i.stock < 1) return `${Math.round(i.stock * 1000)} g`
  return `${i.stock} ${i.unit}`
}

function fmtMin(i: Ingredient): string {
  if (i.unit === 'kg' && i.minStock < 1) return `${Math.round(i.minStock * 1000)} g`
  return `${i.minStock} ${i.unit}`
}

async function orderItem(i: Ingredient): Promise<void> {
  if (inShopping.value.has(i.id)) {
    toast.add({ title: `${i.name} ya está en la Lista de Compras`, icon: 'i-lucide-info' })
    return
  }
  await addShopping({ ingredientId: i.id })
  toast.add({ title: `${i.name} agregado a Lista de Compras`, icon: 'i-lucide-check-circle-2' })
}

/* ===== Carga masiva CSV (HU-02-02) ===== */
type StockImportReport = {
  total: number
  created: number
  updated: number
  failed: number
  errors: { line: number, message: string }[]
}
const { mutateAsync: importIngredients, isLoading: importing } = useImportIngredients()
const showImport = ref(false)
const importReport = ref<StockImportReport | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

async function onImportFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const content = await file.text()
    importReport.value = await importIngredients(content)
    const r = importReport.value
    toast.add({
      title: `Importados: ${r.created} nuevos · ${r.updated} actualizados`,
      icon: 'i-lucide-check-circle-2',
    })
  }
  catch {
    toast.add({ title: 'No se pudo importar el archivo', icon: 'i-lucide-alert-triangle', color: 'error' })
  }
  finally {
    input.value = '' // permite re-subir el mismo archivo
  }
}
</script>

<template>
  <div class="stk-screen">
    <!-- Toolbar full-bleed: búsqueda (core) + acciones secundarias discretas -->
    <div class="scr-toolbar">
      <label class="stk-search scr-toolbar-search">
        <UIcon name="i-lucide-search" />
        <input v-model="query" type="search" placeholder="Buscar insumo…" aria-label="Buscar insumo">
      </label>
      <div class="scr-toolbar-right">
        <button
          type="button"
          class="stk-tool-btn"
          aria-label="Escáner de código de barras — próximamente"
          @click="toast.add({ title: 'Escáner próximamente disponible', icon: 'i-lucide-scan-line' })"
        >
          <UIcon name="i-lucide-scan-line" />
          <span class="stk-soon">Pronto</span>
        </button>
        <button type="button" class="stk-icon-btn" aria-label="Importar insumos (CSV)" @click="showImport = true">
          <UIcon name="i-lucide-upload" />
        </button>
        <NuxtLink to="/app/inventario/movimientos" class="stk-icon-btn" aria-label="Historial de movimientos">
          <UIcon name="i-lucide-history" />
        </NuxtLink>
      </div>
    </div>

    <div class="scr-body">
      <div class="scr-main">

        <!-- ── Atención: única superficie de criticidad (reemplaza callout + sección Críticos) ── -->
        <section v-if="critical.length" class="stk-attention" aria-label="Insumos que necesitan atención">
          <div class="stk-attention-head">
            <UIcon name="i-lucide-triangle-alert" class="stk-attention-ico" aria-hidden="true" />
            <h2 class="stk-attention-title">Necesitan atención</h2>
            <span class="stk-attention-count">{{ critical.length }}</span>
          </div>
          <ul class="stk-attention-list">
            <li v-for="c in critical" :key="c.id" class="stk-attention-item">
              <NuxtLink :to="`/app/inventario/producto/${c.id}`" class="stk-attention-link">
                <span class="stk-attention-name">{{ c.name }}</span>
                <span class="stk-attention-meta">{{ fmtStock(c) }} · mínimo {{ fmtMin(c) }}</span>
              </NuxtLink>
              <button
                type="button"
                class="stk-attention-cta"
                :class="{ done: inShopping.has(c.id) }"
                :aria-label="inShopping.has(c.id) ? `${c.name} agregado a la lista` : `Pedir ${c.name}`"
                @click="orderItem(c)"
              >
                <UIcon :name="inShopping.has(c.id) ? 'i-lucide-check' : 'i-lucide-plus'" />
                {{ inShopping.has(c.id) ? 'Agregado' : 'Pedir' }}
              </button>
            </li>
          </ul>
          <NuxtLink to="/app/inventario/lista-compras" class="stk-attention-foot">
            Ver lista de compras <UIcon name="i-lucide-arrow-right" />
          </NuxtLink>
        </section>

        <!-- ── Mi inventario: contenido core, visible en el primer scroll ── -->
        <section class="stk-inv" aria-label="Inventario por categoría">
          <div class="stk-inv-head">
            <h2 class="stk-inv-title">Mi inventario</h2>
            <span class="stk-inv-count">{{ filtered.length }} de {{ all.length }}</span>
          </div>

          <div class="stk-chips" role="tablist" aria-label="Filtrar por categoría">
            <button
              v-for="c in categories"
              :key="c"
              role="tab"
              :aria-selected="cat === c"
              class="stk-chip"
              :class="{ active: cat === c }"
              @click="cat = c"
            >{{ c }}</button>
            <button
              v-if="noCostCount > 0"
              role="tab"
              :aria-selected="cat === 'sin-costo'"
              class="stk-chip warn"
              :class="{ active: cat === 'sin-costo' }"
              @click="cat = cat === 'sin-costo' ? 'Todos' : 'sin-costo'"
            >
              <UIcon name="i-lucide-alert-triangle" /> Sin costo ({{ noCostCount }})
            </button>
          </div>

          <div class="stk-list">
            <NuxtLink
              v-for="it in filtered"
              :key="it.id"
              :to="`/app/inventario/producto/${it.id}`"
              class="stk-row"
              :aria-label="`${it.name}, ${it.category}, ${fmtStock(it)}, ${STATUS_LABEL[statusOf(it)]}`"
            >
              <span class="stk-row-ico" aria-hidden="true">{{ emojiOf(it) }}</span>
              <div class="stk-row-main">
                <div class="stk-row-name">{{ it.name }}</div>
                <div class="stk-row-meta">
                  {{ it.category }}
                  <template v-if="it.unitCost > 0"> · S/ {{ it.unitCost.toFixed(2) }}/{{ it.unit }}</template>
                  <span v-else class="missing"> · Sin costo</span>
                </div>
              </div>
              <div class="stk-row-end">
                <span class="stk-row-stock">{{ fmtStock(it) }}</span>
                <span class="stk-state" :class="`is-${statusOf(it)}`">
                  <span class="d" aria-hidden="true" />
                  {{ STATUS_LABEL[statusOf(it)] }}
                </span>
              </div>
            </NuxtLink>

            <UiEmptyState
              v-if="filtered.length === 0"
              icon="i-lucide-package-search"
              title="No hay insumos en esta categoría"
              subtitle="Probá con otro filtro o búsqueda."
            />
          </div>
        </section>

        <!-- ── Acciones: 1 primaria + resto compacto en grilla unificada ── -->
        <section class="stk-actions" aria-label="Acciones de inventario">
          <h2 class="stk-actions-label">Acciones</h2>

          <NuxtLink to="/app/datos/factura-ia" class="stk-primary">
            <span class="stk-primary-ico" aria-hidden="true"><UIcon name="i-lucide-scan-line" /></span>
            <span class="stk-primary-body">
              <span class="stk-primary-title">Escanear factura</span>
              <span class="stk-primary-sub">Cargá entradas desde una foto, sin tipear</span>
            </span>
            <span class="stk-primary-badge">Lo más rápido</span>
          </NuxtLink>

          <div class="stk-actions-grid">
            <NuxtLink to="/app/inventario/movimiento" class="stk-act">
              <UIcon name="i-lucide-plus-circle" class="stk-act-ico" aria-hidden="true" />
              <span class="stk-act-label">Ingreso manual</span>
              <span class="stk-act-sub">Sumá o descontá a mano</span>
            </NuxtLink>
            <NuxtLink to="/app/inventario/lista-compras" class="stk-act">
              <UIcon name="i-lucide-shopping-cart" class="stk-act-ico" aria-hidden="true" />
              <span class="stk-act-label">Planificar compra</span>
              <span class="stk-act-sub strong">{{ formatPEN(shoppingTotal) }}</span>
            </NuxtLink>
            <NuxtLink to="/app/inventario/ordenes-compra" class="stk-act">
              <UIcon name="i-lucide-clipboard-list" class="stk-act-ico" aria-hidden="true" />
              <span class="stk-act-label">Órdenes de compra</span>
              <span class="stk-act-sub">Pedidos a proveedores</span>
            </NuxtLink>
            <NuxtLink to="/app/inventario/mermas" class="stk-act is-danger">
              <UIcon name="i-lucide-trash-2" class="stk-act-ico" aria-hidden="true" />
              <span class="stk-act-label">Registrar merma</span>
              <span class="stk-act-sub">Lo que se perdió o venció</span>
            </NuxtLink>
          </div>
        </section>
      </div>

      <aside class="scr-aside">
        <section class="scr-panel">
          <header class="scr-panel-head">
            <span class="scr-eyebrow">Inventario</span>
            <h3 class="scr-panel-title">{{ all.length }}<span class="scr-of"> insumos activos</span></h3>
          </header>
          <dl class="scr-stats">
            <div class="scr-stat">
              <dt>Valor del inventario</dt>
              <dd>{{ formatPEN(totalValue) }}</dd>
            </div>
            <div class="scr-stat">
              <dt>Costos cargados</dt>
              <dd :class="{ success: withCostPct === 100 }">{{ withCostPct }}<span class="u">%</span></dd>
            </div>
          </dl>
          <p v-if="noCostCount" class="stk-aside-note">
            <button type="button" @click="cat = 'sin-costo'">
              Completá el costo de {{ noCostCount }} insumo{{ noCostCount === 1 ? '' : 's' }}
            </button>
            para afinar el valor estimado.
          </p>
        </section>
      </aside>
    </div>

    <!-- Carga masiva CSV (HU-02-02) -->
    <UiBottomSheet v-model="showImport" title="Importar insumos (CSV)">
      <div class="stk-import">
        <p class="stk-import-hint">
          Subí un archivo <b>CSV</b> con tus insumos (nombre, categoría, unidad y costo).
          Si volvés a subirlo, actualizamos los que ya existen — no se duplican.
        </p>
        <label class="stk-import-drop" :class="{ busy: importing }">
          <UIcon :name="importing ? 'i-lucide-loader-circle' : 'i-lucide-upload'" :class="{ spin: importing }" />
          <span>{{ importing ? 'Importando…' : 'Elegir archivo CSV' }}</span>
          <input
            ref="fileInput"
            type="file"
            accept=".csv,text/csv"
            :disabled="importing"
            hidden
            @change="onImportFile"
          >
        </label>

        <div v-if="importReport" class="stk-import-report">
          <div class="stk-import-stats">
            <span class="ok">{{ importReport.created }} nuevos</span>
            <span class="upd">{{ importReport.updated }} actualizados</span>
            <span v-if="importReport.failed > 0" class="err">{{ importReport.failed }} con error</span>
          </div>
          <ul v-if="importReport.errors.length" class="stk-import-errors">
            <li v-for="(e, idx) in importReport.errors" :key="idx">
              <b>Línea {{ e.line }}:</b> {{ e.message }}
            </li>
          </ul>
        </div>
      </div>
    </UiBottomSheet>
  </div>
</template>

<style scoped>
.stk-screen { padding: 0; }

/* ============ Toolbar ============ */
.stk-search {
  display: flex; align-items: center; gap: 8px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 0 12px;
  height: 40px;
  box-sizing: border-box;
}
.stk-search:focus-within { border-color: var(--terracotta); box-shadow: var(--focus-ring); }
.stk-search input {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  font: inherit; font-size: 14px; color: var(--fg1);
}
.stk-search input::placeholder { color: var(--fg3); }
.stk-search .iconify { width: 16px; height: 16px; color: var(--fg2); }

/* Escáner: de-emphasizado (outline + badge "Pronto"), no es acción real todavía */
.stk-tool-btn {
  display: inline-flex; align-items: center; gap: 6px;
  height: 40px; padding: 0 12px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  color: var(--fg2); cursor: pointer;
  font: inherit; font-size: 12px; font-weight: 600;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.stk-tool-btn:hover { background: var(--crema-200); color: var(--fg1); }
.stk-tool-btn .iconify { width: 18px; height: 18px; }
.stk-soon {
  font-size: 10px; font-weight: 700; letter-spacing: 0.02em;
  text-transform: uppercase; color: var(--fg2);
}

.stk-icon-btn {
  width: 40px; height: 40px; border-radius: 12px;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--fg2);
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.stk-icon-btn:hover { background: var(--crema-200); color: var(--fg1); }
.stk-icon-btn .iconify { width: 18px; height: 18px; }

@media (max-width: 420px) {
  .stk-soon { display: none; }
  .stk-tool-btn { padding: 0; width: 40px; justify-content: center; }
}

/* ============ Atención (única superficie tintada, PLANA) ============ */
.stk-attention {
  margin-bottom: 22px;
  background: color-mix(in srgb, var(--danger-bg) 55%, var(--pure-white));
  border: 1px solid color-mix(in srgb, var(--danger) 22%, transparent);
  border-radius: 16px;
  padding: 14px 16px;
}
.stk-attention-head {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 8px;
}
.stk-attention-ico { width: 18px; height: 18px; color: var(--danger); flex-shrink: 0; }
.stk-attention-title { margin: 0; font-size: 14px; font-weight: 700; color: var(--fg1); }
.stk-attention-count {
  font-size: 11px; font-weight: 700; color: var(--danger);
  background: var(--pure-white);
  border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
  border-radius: 999px;
  min-width: 20px; height: 20px; padding: 0 6px;
  display: inline-flex; align-items: center; justify-content: center;
  font-variant-numeric: tabular-nums;
}
.stk-attention-list { list-style: none; margin: 0; padding: 0; }
.stk-attention-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 0;
  border-top: 1px solid color-mix(in srgb, var(--danger) 14%, transparent);
}
.stk-attention-item:first-child { border-top: none; }
.stk-attention-link {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 1px;
  text-decoration: none;
}
.stk-attention-name { font-size: 13.5px; font-weight: 600; color: var(--fg1); }
.stk-attention-meta { font-size: 12px; color: var(--fg2); font-variant-numeric: tabular-nums; }
.stk-attention-cta {
  flex-shrink: 0;
  display: inline-flex; align-items: center; gap: 5px;
  height: 40px; padding: 0 14px;
  background: var(--pure-white);
  border: 1px solid var(--border);
  color: var(--terracotta-700);
  border-radius: 10px; cursor: pointer;
  font: inherit; font-size: 12.5px; font-weight: 600;
  transition: background var(--dur) var(--ease-standard);
}
.stk-attention-cta:hover { background: var(--crema-100); }
.stk-attention-cta.done {
  color: var(--oliva-700);
  border-color: color-mix(in srgb, var(--oliva) 32%, transparent);
}
.stk-attention-cta .iconify { width: 14px; height: 14px; }
.stk-attention-foot {
  display: inline-flex; align-items: center; gap: 5px;
  margin-top: 10px;
  font-size: 12.5px; font-weight: 600; color: var(--terracotta-700);
  text-decoration: none;
}
.stk-attention-foot:hover { color: var(--terracotta); }
.stk-attention-foot .iconify { width: 14px; height: 14px; }

/* ============ Mi inventario (core) ============ */
.stk-inv { margin-bottom: 26px; }
.stk-inv-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
  margin-bottom: 12px;
}
.stk-inv-title { margin: 0; font-size: 16px; font-weight: 600; color: var(--fg1); }
.stk-inv-count {
  font-size: 12px; font-weight: 500; color: var(--fg2);
  font-variant-numeric: tabular-nums;
}

.stk-chips {
  display: flex; gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  margin-bottom: 12px;
}
.stk-chips::-webkit-scrollbar { display: none; }
.stk-chip {
  display: inline-flex; align-items: center; gap: 5px;
  font: inherit; font-size: 12.5px; font-weight: 500;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--fg2);
  padding: 7px 13px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background var(--dur) var(--ease-standard), color var(--dur) var(--ease-standard);
}
.stk-chip.active { background: var(--espresso); color: var(--crema-100); border-color: var(--espresso); }
.stk-chip.warn { border-color: var(--mostaza); color: var(--mostaza-700); }
.stk-chip.warn.active { background: var(--mostaza); color: var(--espresso); border-color: var(--mostaza); }
.stk-chip .iconify { width: 12px; height: 12px; }

/* Lista densa: 2 líneas por fila, stock a la derecha en tabular-nums */
.stk-list {
  display: flex; flex-direction: column;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--pure-white);
  overflow: hidden;
}
.stk-row {
  display: flex; align-items: center; gap: 12px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--border-subtle);
  text-decoration: none;
  transition: background var(--dur) var(--ease-standard);
}
.stk-row:last-child { border-bottom: none; }
.stk-row:hover { background: var(--crema-50); }
.stk-row-ico {
  width: 40px; height: 40px; border-radius: 11px;
  background: var(--crema-100);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 19px;
  flex-shrink: 0;
}
.stk-row-main { flex: 1; min-width: 0; }
.stk-row-name {
  font-size: 14px; font-weight: 600; color: var(--fg1);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.stk-row-meta {
  font-size: 12px; color: var(--fg2); margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.stk-row-meta .missing { color: var(--mostaza-700); font-weight: 600; }
.stk-row-end {
  display: flex; flex-direction: column; align-items: flex-end; gap: 4px;
  flex-shrink: 0;
}
.stk-row-stock {
  font-size: 14px; font-weight: 600; color: var(--fg1);
  font-variant-numeric: tabular-nums;
}

/* Estado: OK de-emphasizado (dot neutro, SIN pill). Low/Crit = pill que salta (Von Restorff). */
.stk-state {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 600;
}
.stk-state .d { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.stk-state.is-ok { color: var(--fg2); }
.stk-state.is-ok .d { background: var(--oliva); opacity: 0.5; }
.stk-state.is-low, .stk-state.is-crit {
  padding: 3px 9px; border-radius: 999px; font-weight: 700; font-size: 10.5px;
}
.stk-state.is-low { background: var(--warning-bg); color: var(--mostaza-700); }
.stk-state.is-low .d { background: var(--mostaza); }
.stk-state.is-crit { background: var(--danger-bg); color: var(--danger); }
.stk-state.is-crit .d { background: var(--danger); }

/* ============ Acciones ============ */
.stk-actions-label {
  margin: 0 0 12px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--fg3);
}

/* Primaria: destacada por estructura (más grande, ícono + badge), SIN superficie tintada */
.stk-primary {
  display: flex; align-items: center; gap: 14px;
  background: var(--pure-white);
  border: 1px solid var(--terracotta-300);
  border-radius: 14px; padding: 16px;
  margin-bottom: 10px;
  text-decoration: none;
  transition: background var(--dur) var(--ease-standard), border-color var(--dur) var(--ease-standard);
}
.stk-primary:hover { background: var(--crema-50); border-color: var(--terracotta); }
.stk-primary:active { transform: scale(0.99); }
.stk-primary-ico {
  width: 32px; flex-shrink: 0; color: var(--terracotta-700);
  display: inline-flex; align-items: center; justify-content: center;
}
.stk-primary-ico .iconify { width: 26px; height: 26px; stroke-width: 1.6; }
.stk-primary-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.stk-primary-title { font-size: 15px; font-weight: 700; color: var(--fg1); }
.stk-primary-sub { font-size: 12.5px; color: var(--fg2); }
.stk-primary-badge {
  flex-shrink: 0;
  font-size: 10px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase;
  color: var(--terracotta-700);
  background: var(--terracotta-100);
  padding: 4px 9px; border-radius: 999px;
}

/* Secundarias: grilla unificada, tarjetas idénticas (baselines alineadas) */
.stk-actions-grid {
  display: grid; gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
@media (min-width: 640px) {
  .stk-actions-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
.stk-act {
  display: flex; flex-direction: column;
  background: var(--pure-white);
  border: 1px solid var(--border-subtle);
  border-radius: 14px; padding: 14px;
  min-height: 96px;
  text-decoration: none;
  transition: background var(--dur) var(--ease-standard), border-color var(--dur) var(--ease-standard);
}
.stk-act:hover { background: var(--crema-50); border-color: var(--border); }
.stk-act:active { transform: scale(0.98); }
.stk-act-ico { width: 22px; height: 22px; color: var(--espresso-600); margin-bottom: 10px; flex-shrink: 0; }
.stk-act.is-danger .stk-act-ico { color: var(--danger); }
.stk-act-label { font-size: 13px; font-weight: 600; color: var(--fg1); }
.stk-act-sub { font-size: 11.5px; color: var(--fg2); margin-top: 2px; line-height: 1.35; }
.stk-act-sub.strong { color: var(--fg1); font-weight: 700; font-variant-numeric: tabular-nums; }

/* ============ Aside (insight complementario, no repite crítico/compra) ============ */
.stk-aside-note { margin: 12px 0 0; font-size: 12px; color: var(--fg2); line-height: 1.45; }
.stk-aside-note button {
  color: var(--terracotta-700); font: inherit; font-weight: 600;
  background: none; border: none; padding: 0; cursor: pointer;
}
.stk-aside-note button:hover { text-decoration: underline; }

/* ============ Import sheet ============ */
.stk-import { display: flex; flex-direction: column; gap: 14px; padding: 4px 2px; }
.stk-import-hint { font-size: 13px; color: var(--fg2); line-height: 1.5; }
.stk-import-drop {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 22px; border: 1.5px dashed var(--border); border-radius: 14px;
  cursor: pointer; font-weight: 600; color: var(--fg1); background: var(--crema-100);
}
.stk-import-drop.busy { opacity: 0.7; cursor: default; }
.stk-import-drop .spin { animation: stk-spin 0.9s linear infinite; }
@keyframes stk-spin { to { transform: rotate(360deg); } }
.stk-import-stats { display: flex; flex-wrap: wrap; gap: 8px; }
.stk-import-stats span { font-size: 12.5px; font-weight: 700; padding: 4px 10px; border-radius: 999px; }
.stk-import-stats .ok { background: var(--success-bg); color: var(--oliva-700); }
.stk-import-stats .upd { background: var(--crema-200); color: var(--fg2); }
.stk-import-stats .err { background: var(--danger-bg); color: var(--danger); }
.stk-import-errors { margin-top: 4px; display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow: auto; }
.stk-import-errors li { font-size: 12px; color: var(--fg2); }
.stk-import-errors b { color: var(--danger); }

@media (prefers-reduced-motion: reduce) {
  .stk-primary, .stk-act { transition: none; }
  .stk-primary:active, .stk-act:active { transform: none; }
}
</style>
