import type { ApiResponse } from "#shared/types/api";
import type { ChatMessage, ChatTableData } from "#shared/types/domain";
import type { ChatQueryResult } from "~~/server/api/chat/query.post";

/**
 * Manages the Chat IA conversation thread for E09.
 *
 * Sends questions to POST /api/chat/query (BFF → NestJS) and accumulates
 * the results as a local message array. Errors are surfaced as inline
 * assistant messages (400, 403) or toasts (network/server faults) so the
 * conversation thread always stays coherent.
 *
 * Usage:
 *   const { messages, loading, ask, clearMessages } = useChatQuery()
 *
 * @remarks
 * - Concurrent requests are guarded: `ask` is a no-op while `loading` is true.
 * - The `finally` block always resets `loading`, preventing hung spinners.
 * - `clearMessages` also resets `loading` so a stuck state can be cleared.
 */
export function useChatQuery() {
  const messages = ref<ChatMessage[]>([]);
  const loading = ref(false);
  const toast = useToast();

  /**
   * Posts `question` to the BFF and appends both the user turn and the
   * assistant response (or error turn) to `messages`.
   *
   * @param question - Natural-language question from the user. Trimmed internally.
   */
  async function ask(question: string): Promise<void> {
    const trimmed = question.trim();
    if (loading.value || !trimmed) return;

    // Append the user turn immediately so the UI feels responsive.
    messages.value.push({
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    });

    loading.value = true;
    try {
      const envelope = await $fetch<ApiResponse<ChatQueryResult>>(
        "/api/chat/query",
        {
          method: "POST",
          body: { question: trimmed },
        },
      );

      const result = envelope.data;

      // Build the table only when the backend returned column metadata; an empty
      // columns array means the query produced no structured results (text answer only).
      const table: ChatTableData | undefined =
        result.columns.length > 0
          ? { columns: result.columns, rows: result.rows }
          : undefined;

      messages.value.push({
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.answer,
        // Guard against an empty SQL string (backend may omit it on some providers).
        sql: result.sql || undefined,
        table,
        provider: result.provider,
        model: result.model,
        // ADDITIVE (F2b) — `kind`/`forecast` are `undefined` on legacy responses;
        // the UI treats a missing `kind` as `historical` (zero behavior change).
        kind: result.kind,
        forecast: result.forecast,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      const err = error as { statusCode?: number };
      const status = err.statusCode ?? 0;

      if (status === 400) {
        // The LLM could not generate a safe query — show inline, not a crash.
        messages.value.push({
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "No pude generar una consulta segura para esa pregunta. Intentá reformularla con más detalle.",
          createdAt: new Date().toISOString(),
        });
      } else if (status === 403) {
        // Staff role — CASL denies access; the page should already gate this, but
        // handle it defensively so the thread stays coherent.
        messages.value.push({
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "No tenés permiso para usar el Chat IA. Esta función está disponible para gerentes y propietarios.",
          createdAt: new Date().toISOString(),
        });
      } else {
        // Transient network or server error: a toast is less disruptive than an
        // inline error message since the user can simply retry.
        toast.add({
          title: "Error de conexión",
          description:
            "No se pudo conectar con el servidor. Verificá tu conexión e intentá de nuevo.",
          icon: "i-lucide-wifi-off",
        });
      }
    } finally {
      // Always release the lock — no hung spinners regardless of error path.
      loading.value = false;
    }
  }

  /**
   * Resets the conversation to the initial empty state.
   * Also clears `loading` as a safety net against a stuck state.
   */
  function clearMessages(): void {
    messages.value = [];
    loading.value = false;
  }

  return { messages, loading, ask, clearMessages };
}
