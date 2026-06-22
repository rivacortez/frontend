<script setup lang="ts">
import type { ChatMessage } from '#shared/types/domain'

definePageMeta({ layout: 'app' })
useSeoMeta({ title: 'Chat analítico — GastronomIA' })

const { user } = useUserSession()
const toast = useToast()
const { messages, streaming, ask, stop } = useChatStream()

const firstName = computed(() => user.value?.name?.split(' ')[0] ?? '')

// El topbar muestra el título estable del shell; el saludo editorial vive en el
// empty-state del cuerpo (evita duplicar el mismo texto en ambos lugares).
definePageHeader(() => ({
  title: 'Chat IA',
  subtitle: 'Lenguaje natural → SQL',
}))

// ===== Catálogo de consultas por categoría (estado inicial) =====
interface QueryCategory {
  label: string
  questions: string[]
}
const CATEGORIES: QueryCategory[] = [
  {
    label: 'Ventas',
    questions: [
      '¿Cuánto vendí hoy?',
      '¿Cuál es mi ticket promedio?',
      '¿Cuál fue mi plato más vendido esta semana?',
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
      '¿Cuál es mi margen real?',
      '¿Cuál es mi plato más rentable?',
      '¿Qué platos tienen food cost alto?',
    ],
  },
  {
    label: 'Tendencias',
    questions: [
      '¿Cómo va la semana vs la anterior?',
      'Comparame este mes con el anterior',
      '¿Qué día de la semana vendo más?',
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
  if (!question || streaming.value) return
  text.value = ''
  ask(question)
}

// ===== Auto-scroll en cada chunk =====
watch(messages, () => {
  if (!import.meta.client) return
  requestAnimationFrame(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight })
  })
}, { deep: true, flush: 'post' })

// ===== Render de **bold** sin librerías =====
interface TextSegment { text: string, bold: boolean }
function boldSegments(content: string): TextSegment[] {
  return content
    .split('**')
    .map((segment, index) => ({ text: segment, bold: index % 2 === 1 }))
    .filter(segment => segment.text.length > 0)
}

// ===== Bloque SQL colapsable =====
const collapsedSql = reactive<Record<string, boolean>>({})
function toggleSql(id: string): void {
  collapsedSql[id] = !collapsedSql[id]
}
function showTyping(message: ChatMessage, index: number): boolean {
  return message.role === 'assistant'
    && streaming.value
    && index === messages.value.length - 1
    && !message.content
}

// ===== Opciones =====
const confirmClearOpen = ref(false)
function confirmClear(): void {
  stop()
  messages.value = []
  text.value = ''
  confirmClearOpen.value = false
  toast.add({ title: 'Conversación limpiada', icon: 'i-lucide-trash-2' })
}
</script>

<template>
  <div class="chat" :class="{ 'is-empty': messages.length === 0 }">
    <!-- ============ Estado inicial: consola de consultas ============ -->
    <section v-if="messages.length === 0" class="intro">
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
    <div v-else class="thread" aria-live="polite">
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
          <!-- SQL generado (colapsable) -->
          <div v-if="m.sql" class="sql">
            <button
              type="button"
              class="sql-head"
              :aria-expanded="!collapsedSql[m.id]"
              @click="toggleSql(m.id)"
            >
              <UIcon name="i-lucide-database" /> SQL generado
              <UIcon name="i-lucide-chevron-down" class="sql-chev" :class="{ open: !collapsedSql[m.id] }" />
            </button>
            <pre v-show="!collapsedSql[m.id]" class="sql-code">{{ m.sql }}</pre>
          </div>

          <!-- Tabla de resultados -->
          <div v-if="m.table" class="result-wrap">
            <table class="result-table">
              <thead>
                <tr><th v-for="col in m.table.columns" :key="col">{{ col }}</th></tr>
              </thead>
              <tbody>
                <tr v-for="(row, ri) in m.table.rows" :key="ri">
                  <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Respuesta -->
          <p v-if="m.content" class="bubble-text">
            <template v-for="(seg, si) in boldSegments(m.content)" :key="si">
              <b v-if="seg.bold">{{ seg.text }}</b>
              <template v-else>{{ seg.text }}</template>
            </template>
          </p>

          <div v-if="showTyping(m, index)" class="typing" aria-label="Escribiendo">
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
          @keydown.enter.exact.prevent="send"
        />
        <button
          v-if="streaming"
          type="button"
          class="composer-send stop"
          aria-label="Detener respuesta"
          @click="stop"
        >
          <UIcon name="i-lucide-square" />
        </button>
        <button
          v-else
          type="button"
          class="composer-send"
          :class="{ active: hasText }"
          :disabled="!hasText"
          aria-label="Enviar pregunta"
          @click="send"
        >
          <UIcon name="i-lucide-arrow-up" />
        </button>
      </div>
      <p class="composer-hint">Las respuestas se calculan sobre tus datos en tiempo real.</p>
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
.composer-input::placeholder { color: var(--fg3); }
.composer-send {
  width: 36px; height: 36px; border-radius: 11px; flex-shrink: 0;
  background: var(--crema-200); border: none; color: var(--fg3); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background var(--dur), color var(--dur), transform 80ms;
}
.composer-send.active { background: var(--terracotta); color: var(--crema-100); }
.composer-send.active:hover { background: var(--terracotta-700); }
.composer-send.stop { background: var(--espresso-800); color: var(--crema-100); }
.composer-send:active { transform: scale(0.94); }
.composer-send .iconify { width: 17px; height: 17px; }
.composer-hint {
  max-width: 820px; margin: 7px auto 0; padding: 0 4px;
  font-size: 11px; color: var(--fg3); text-align: center;
}
@media (max-width: 1023px) { .composer-hint { display: none; } }

.confirm-text { margin: 0; font-size: 13.5px; color: var(--fg2); line-height: 1.5; }
.confirm-actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
