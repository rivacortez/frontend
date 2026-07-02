<script setup lang="ts">
import type { ChatMessage } from '#shared/types/domain'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Chat IA — GastronomIA' })

const { user } = useUserSession()
const toast = useToast()
const { messages, loading, ask, clearMessages } = useChatQuery()

const firstName = computed(() => user.value?.name?.split(' ')[0] ?? '')

// Staff cannot use Chat IA — the backend enforces CASL (403). Gate the UI
// defensively so staff never fires a request that will unconditionally fail.
const canChat = computed(
  () => user.value?.role === 'owner' || user.value?.role === 'manager',
)

definePageHeader(() => ({
  title: 'Chat IA',
  subtitle: 'Lenguaje natural → SQL',
}))

// ===== Catálogo de consultas por categoría (estado inicial) =====
interface QueryCategory {
  label: string
  questions: string[]
}

// These questions are validated against the backend's analytics tables
// (sales_history, inventory, recipes) and reliably produce structured results.
const CATEGORIES: QueryCategory[] = [
  {
    label: 'Ventas',
    questions: [
      '¿Cuáles son mis platos más vendidos?',
      '¿Cuánto vendí esta semana?',
      '¿Cuál es mi ticket promedio?',
    ],
  },
  {
    label: 'Inventario',
    questions: [
      '¿Qué insumos están por agotarse?',
      '¿Cuánto vale mi stock actual?',
      '¿Qué mermas tuve este mes?',
    ],
  },
  {
    label: 'Márgenes y costos',
    questions: [
      '¿Cuál es mi plato más rentable?',
      '¿Qué platos tienen food cost alto?',
      '¿Cuál es mi margen real?',
    ],
  },
  {
    label: 'Tendencias',
    questions: [
      '¿Cómo van las ventas de este mes?',
      'Comparame este mes con el anterior',
      '¿Qué día de la semana vendo más?',
    ],
  },
  {
    label: 'Proyecciones',
    questions: [
      // F2b: única pregunta sobre el futuro — responde desde el forecast
      // contextual real (ChatService.answerFuture), no genera SQL.
      '¿Cuánto voy a vender este fin de semana?',
    ],
  },
]

// ===== Input =====
const text = ref('')
const inputEl = ref<HTMLTextAreaElement | null>(null)
const hasText = computed(() => text.value.trim().length > 0)

watch(text, () => {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`
})

function send(): void {
  const question = text.value.trim()
  if (!question || loading.value) return
  text.value = ''
  ask(question)
}

// Auto-scroll on each new message and on loading state change (to reveal the
// typing indicator as soon as it appears in the thread).
watch([messages, loading], () => {
  if (!import.meta.client) return
  requestAnimationFrame(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight })
  })
}, { deep: true, flush: 'post' })

// ===== Render **bold** inline without a markdown library =====
interface TextSegment { text: string, bold: boolean }
function boldSegments(content: string): TextSegment[] {
  return content
    .split('**')
    .map((segment, index) => ({ text: segment, bold: index % 2 === 1 }))
    .filter(segment => segment.text.length > 0)
}

// ===== SQL collapsible (collapsed by default: keeps the thread scannable) =====
const collapsedSql = reactive<Record<string, boolean>>({})
function toggleSql(id: string): void {
  collapsedSql[id] = !collapsedSql[id]
}

// ===== Provider badge label — "provider · model" =====
function providerLabel(m: ChatMessage): string {
  if (!m.provider) return ''
  return m.model ? `${m.provider} · ${m.model}` : m.provider
}

// ===== Clear conversation =====
const confirmClearOpen = ref(false)
function confirmClear(): void {
  clearMessages()
  text.value = ''
  confirmClearOpen.value = false
  toast.add({ title: 'Conversación limpiada', icon: 'i-lucide-trash-2' })
}
</script>

<template>
  <!-- ============ Acceso restringido (staff) ============ -->
  <div v-if="!canChat" class="access-gate">
    <div class="access-inner">
      <UIcon name="i-lucide-lock" class="access-icon" aria-hidden="true" />
      <p class="access-title">Acceso restringido</p>
      <p class="access-body">
        El Chat IA está disponible para gerentes y propietarios.
        Contactá a tu administrador si necesitás acceso.
      </p>
    </div>
  </div>

  <!-- ============ Chat principal (owner / manager) ============ -->
  <div v-else class="chat" :class="{ 'is-empty': messages.length === 0 && !loading }">
    <!-- ============ Estado inicial: consola de consultas ============ -->
    <section v-if="messages.length === 0 && !loading" class="intro">
      <div class="intro-top">
        <div>
          <p class="eyebrow">Chat analítico · lenguaje natural → SQL</p>
          <h1 class="intro-h display">
            ¿Qué querés saber<template v-if="firstName">, {{ firstName }}</template>?
          </h1>
          <p class="intro-sub">
            Escribí una pregunta sobre tus ventas, márgenes o stock. Armo la consulta
            sobre tus datos y te respondo con los números reales.
          </p>
        </div>
      </div>

      <div class="cats">
        <div v-for="c in CATEGORIES" :key="c.label" class="cat">
          <p class="cat-label">{{ c.label }}</p>
          <ul class="q-list">
            <li v-for="q in c.questions" :key="q">
              <button type="button" class="q" @click="ask(q)">
                <span class="q-text">{{ q }}</span>
                <UIcon name="i-lucide-arrow-up-right" class="q-go" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- ============ Conversación ============ -->
    <div v-else class="thread" aria-live="polite" aria-label="Conversación con GastronomIA">
      <div class="thread-bar">
        <span class="thread-title">Conversación</span>
        <button type="button" class="thread-clear" @click="confirmClearOpen = true">
          <UIcon name="i-lucide-trash-2" /> Limpiar
        </button>
      </div>

      <div
        v-for="(m, index) in messages"
        :key="m.id"
        class="msg"
        :class="m.role === 'user' ? 'me' : 'ai'"
      >
        <span class="msg-tag">{{ m.role === 'user' ? 'Vos' : 'GastronomIA' }}</span>
        <div class="bubble">
          <!-- SQL generado (colapsable; cerrado por defecto) -->
          <div v-if="m.sql" class="sql">
            <button
              type="button"
              class="sql-head"
              :aria-expanded="!collapsedSql[m.id]"
              :aria-controls="`sql-body-${m.id}`"
              @click="toggleSql(m.id)"
            >
              <UIcon name="i-lucide-database" aria-hidden="true" /> Ver consulta SQL
              <UIcon
                name="i-lucide-chevron-down"
                class="sql-chev"
                :class="{ open: !collapsedSql[m.id] }"
                aria-hidden="true"
              />
            </button>
            <pre
              :id="`sql-body-${m.id}`"
              v-show="!collapsedSql[m.id]"
              class="sql-code"
              tabindex="-1"
            >{{ m.sql }}</pre>
          </div>

          <!-- Tabla de resultados -->
          <div v-if="m.table" class="result-wrap" role="region" :aria-label="`Resultados de la consulta ${index + 1}`">
            <table class="result-table">
              <thead>
                <tr>
                  <th v-for="col in m.table.columns" :key="col" scope="col">{{ col }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, ri) in m.table.rows" :key="ri">
                  <td v-for="(cell, ci) in row" :key="ci">{{ cell ?? '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Respuesta en lenguaje natural (el disclaimer de proyección vive acá, siempre visible) -->
          <p v-if="m.content" class="bubble-text">
            <template v-for="(seg, si) in boldSegments(m.content)" :key="si">
              <b v-if="seg.bold">{{ seg.text }}</b>
              <template v-else>{{ seg.text }}</template>
            </template>
          </p>

          <!-- Bloque de proyección (kind: future con datos) — reusa ForecastDriverChips de fase 3 -->
          <div v-if="m.kind === 'future' && m.forecast" class="forecast-block">
            <p class="forecast-tag">
              <UIcon name="i-lucide-line-chart" class="forecast-tag-ico" aria-hidden="true" />
              Proyección · {{ m.forecast.range.label }}
            </p>
            <p class="forecast-total">
              {{ formatPEN(m.forecast.totalYhat) }}
              <span class="forecast-band">
                banda {{ formatPEN(m.forecast.totalLo) }} – {{ formatPEN(m.forecast.totalHi) }}
              </span>
            </p>
            <!-- Detalle por día: solo aporta si el rango cubre más de un día -->
            <ul v-if="m.forecast.points.length > 1" class="forecast-days">
              <li v-for="p in m.forecast.points" :key="p.targetDate">
                <span class="forecast-day-date">{{ formatShortDate(p.targetDate) }}</span>
                <span class="forecast-day-val">{{ formatPEN(p.yhat) }}</span>
              </li>
            </ul>
            <ForecastDriverChips
              v-if="m.forecast.drivers.length"
              :drivers="m.forecast.drivers"
              :max-chips="3"
            />
          </div>

          <!-- Badge de proveedor: transparencia sobre qué modelo respondió.
               Oculto en proyecciones — el badge "Proyección" de arriba ya lo distingue
               y "system · forecast-run" no aporta como transparencia de modelo LLM. -->
          <p v-if="m.provider && m.kind !== 'future'" class="provider-badge">
            <UIcon name="i-lucide-cpu" class="provider-icon" aria-hidden="true" />
            {{ providerLabel(m) }}
          </p>
        </div>
      </div>

      <!-- Indicador de "escribiendo" mientras espera la respuesta del backend -->
      <div v-if="loading" class="msg ai" aria-label="GastronomIA está procesando la consulta">
        <span class="msg-tag" aria-hidden="true">GastronomIA</span>
        <div class="bubble">
          <div class="typing" aria-label="Procesando consulta">
            <span /><span /><span />
          </div>
        </div>
      </div>
    </div>

    <!-- ============ Composer (input) ============ -->
    <div class="composer">
      <div class="composer-inner">
        <textarea
          ref="inputEl"
          v-model="text"
          class="composer-input"
          placeholder="Preguntá sobre tu negocio…"
          rows="1"
          aria-label="Escribe tu pregunta"
          :disabled="loading"
          @keydown.enter.exact.prevent="send"
        />
        <button
          type="button"
          class="composer-send"
          :class="{ active: hasText && !loading }"
          :disabled="!hasText || loading"
          aria-label="Enviar pregunta"
          @click="send"
        >
          <UIcon
            :name="loading ? 'i-lucide-loader-2' : 'i-lucide-arrow-up'"
            :class="{ spin: loading }"
          />
        </button>
      </div>
      <p class="composer-hint">Las respuestas se calculan sobre tus datos en tiempo real · IA</p>
    </div>

    <!-- Confirmación limpiar -->
    <UiBottomSheet v-model="confirmClearOpen" title="¿Limpiar la conversación?">
      <p class="confirm-text">Volverás al estado inicial. Esta acción no se puede deshacer.</p>
      <template #cta>
        <div class="confirm-actions">
          <button class="btn btn-ghost" type="button" @click="confirmClearOpen = false">Cancelar</button>
          <button class="btn btn-primary" type="button" @click="confirmClear">Limpiar</button>
        </div>
      </template>
    </UiBottomSheet>
  </div>
</template>

<style scoped>
/* ============ Acceso restringido ============ */
.access-gate {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60dvh;
  padding: 40px 24px;
}
.access-inner {
  max-width: 380px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.access-icon {
  width: 40px; height: 40px;
  color: var(--fg3);
}
.access-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--fg1);
  margin: 0;
}
.access-body {
  font-size: 14px;
  color: var(--fg2);
  line-height: 1.55;
  margin: 0;
}

.chat {
  width: 100%;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

/* ============ Estado inicial: consola full-width ============ */
.intro {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: clamp(28px, 6vh, 72px) clamp(20px, 4vw, 40px) 32px;
  flex: 1;
}
.intro-top { margin-bottom: clamp(28px, 5vh, 48px); }
.intro-h {
  font-size: clamp(32px, 4.5vw, 56px);
  margin: 10px 0 0;
  max-width: 18ch;
}
.intro-sub {
  margin-top: 16px;
  font-size: clamp(15px, 1.6vw, 18px);
  line-height: 1.55;
  color: var(--fg2);
  max-width: 52ch;
  text-wrap: pretty;
}

/* Catálogo de consultas: grid de pared a pared */
.cats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: clamp(20px, 3vw, 40px) clamp(24px, 4vw, 56px);
}
.cat-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--fg3);
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 4px;
}
.q-list { list-style: none; padding: 0; margin: 0; }
.q {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  padding: 13px 2px;
  font-family: inherit;
  font-size: 14.5px;
  color: var(--fg1);
  text-align: left;
  cursor: pointer;
  transition: color var(--dur) var(--ease-standard), padding var(--dur) var(--ease-standard);
}
.q:hover { color: var(--terracotta-700); padding-left: 8px; }
.q-text { line-height: 1.4; }
.q-go {
  width: 15px; height: 15px; flex-shrink: 0;
  color: var(--fg3);
  opacity: 0; transform: translate(-4px, 2px);
  transition: opacity var(--dur), transform var(--dur), color var(--dur);
}
.q:hover .q-go { opacity: 1; transform: translate(0, 0); color: var(--terracotta-700); }

/* ============ Conversación ============ */
.thread {
  width: 100%;
  max-width: 820px;
  margin: 0 auto;
  flex: 1;
  padding: clamp(20px, 4vh, 36px) clamp(20px, 4vw, 32px) 140px;
  display: flex; flex-direction: column; gap: 22px;
}
.thread-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-subtle);
}
.thread-title {
  font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg3);
}
.thread-clear {
  background: transparent; border: none; cursor: pointer; font-family: inherit;
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 600; color: var(--fg3);
}
.thread-clear:hover { color: var(--danger); }
.thread-clear .iconify { width: 13px; height: 13px; }

.msg { display: flex; flex-direction: column; gap: 6px; max-width: 86%; }
.msg.ai { align-self: flex-start; }
.msg.me { align-self: flex-end; align-items: flex-end; }
.msg-tag {
  font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--fg3); padding: 0 2px;
}
.bubble {
  font-size: 14.5px; line-height: 1.55;
  padding: 12px 16px;
  border-radius: 16px;
  word-wrap: break-word;
}
.msg.ai .bubble {
  background: var(--bg-card); border: 1px solid var(--border-subtle); color: var(--fg1);
  border-top-left-radius: 5px;
}
.msg.me .bubble {
  background: var(--espresso-800); color: var(--crema-100);
  border-top-right-radius: 5px;
}
.bubble b { font-weight: 600; }
.bubble-text { margin: 0; }

/* SQL */
.sql { margin: 0 0 10px; border-radius: 10px; overflow: hidden; background: var(--espresso); }
.sql-head {
  width: 100%; display: flex; align-items: center; gap: 6px; padding: 8px 11px;
  background: transparent; border: none; color: var(--crema-200); font-family: inherit;
  font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer;
}
.sql-head:focus-visible { outline: 2px solid var(--terracotta-300); outline-offset: -2px; }
.sql-head .iconify { width: 13px; height: 13px; }
.sql-chev { margin-left: auto; transition: transform var(--dur); }
.sql-chev.open { transform: rotate(180deg); }
.sql-code {
  margin: 0; padding: 10px 12px; font-family: var(--font-mono); font-size: 11.5px; line-height: 1.55;
  color: #E8DFD2; white-space: pre-wrap; word-break: break-word; border-top: 1px solid rgba(255,255,255,0.08);
}

/* Tabla */
.result-wrap { margin: 0 0 10px; border: 1px solid var(--border-subtle); border-radius: 10px; overflow-x: auto; }
.result-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.result-table th {
  background: var(--crema-100); font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--fg3); text-align: left; padding: 8px 11px; white-space: nowrap;
}
.result-table td { padding: 8px 11px; border-top: 1px solid var(--border-subtle); color: var(--fg1); white-space: nowrap; }
.result-table td:not(:first-child) { font-variant-numeric: tabular-nums; }

/* Bloque de proyección (F2b) — la única superficie con tinte de la pantalla
   (regla anti-slop "un tinte por pantalla"): crema-100 sin gradiente, borde
   sutil, misma familia visual que .sql/.result-wrap (radio 10px). */
.forecast-block {
  margin: 10px 0 0;
  padding: 12px 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--crema-100);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.forecast-tag {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--terracotta-700);
}
.forecast-tag-ico { width: 12px; height: 12px; flex-shrink: 0; }
.forecast-total {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--fg1);
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
}
.forecast-band {
  font-size: 12px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  color: var(--fg2);
}
.forecast-days {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.forecast-days li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12.5px;
  padding: 3px 0;
  border-top: 1px solid var(--border-subtle);
}
.forecast-days li:first-child { border-top: none; }
.forecast-day-date { color: var(--fg2); }
.forecast-day-val { color: var(--fg1); font-weight: 600; font-variant-numeric: tabular-nums; }

/* Provider badge — one line, muted, non-decorative */
.provider-badge {
  display: inline-flex; align-items: center; gap: 4px;
  margin: 8px 0 0;
  font-size: 10.5px; color: var(--fg3); letter-spacing: 0.04em;
}
.provider-icon { width: 11px; height: 11px; flex-shrink: 0; }

/* Typing */
.typing { display: inline-flex; align-items: center; gap: 4px; padding: 2px 0; }
.typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--terracotta); opacity: 0.4; animation: tb 1.2s var(--ease-standard) infinite; }
.typing span:nth-child(2) { animation-delay: 0.15s; }
.typing span:nth-child(3) { animation-delay: 0.3s; }
@keyframes tb { 0%,60%,100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-4px); opacity: 1; } }

/* ============ Composer ============ */
.composer {
  position: fixed; left: 0; right: 0;
  bottom: calc(68px + env(safe-area-inset-bottom, 0px));
  z-index: 30;
  padding: 10px 16px 12px;
  background: linear-gradient(to bottom, transparent 0%, var(--bg) 36%);
}
@media (min-width: 1024px) {
  .composer { left: 256px; bottom: 0; padding: 14px 32px 26px; }
}
.composer-inner {
  max-width: 820px; margin: 0 auto;
  display: flex; align-items: flex-end; gap: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 8px 8px 8px 16px;
  transition: border-color var(--dur);
}
.composer-inner:focus-within { border-color: var(--terracotta-300); box-shadow: 0 0 0 3px rgba(201,106,67,0.10); }
.composer-input {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  font-family: inherit; font-size: 15px; color: var(--fg1);
  padding: 7px 0; resize: none; max-height: 120px; line-height: 1.45;
}
.composer-input:disabled { opacity: 0.6; cursor: not-allowed; }
.composer-input::placeholder { color: var(--fg3); }
.composer-send {
  width: 36px; height: 36px; border-radius: 11px; flex-shrink: 0;
  background: var(--crema-200); border: none; color: var(--fg3); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background var(--dur), color var(--dur), transform 80ms;
}
.composer-send.active { background: var(--terracotta); color: var(--crema-100); }
.composer-send.active:hover { background: var(--terracotta-700); }
.composer-send:disabled { opacity: 0.55; cursor: not-allowed; }
.composer-send:not(:disabled):active { transform: scale(0.94); }
.composer-send .iconify { width: 17px; height: 17px; }

/* Spin animation for the loading state in the send button */
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 0.7s linear infinite; }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }

.composer-hint {
  max-width: 820px; margin: 7px auto 0; padding: 0 4px;
  font-size: 11px; color: var(--fg3); text-align: center;
}
@media (max-width: 1023px) { .composer-hint { display: none; } }

.confirm-text { margin: 0; font-size: 13.5px; color: var(--fg2); line-height: 1.5; }
.confirm-actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
