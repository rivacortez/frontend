# frontend_context.md — Contexto de desarrollo del Frontend GastronomIA

> **Propósito:** este archivo unifica todas las decisiones documentadas del proyecto relevantes para desarrollar el frontend. Va junto a los archivos del prototipo (`*.jsx`, `*.css`, `*.html`) estan en la carpeta gastronomia-v2para que al iniciar el proyecto Nuxt se tenga el contexto completo: este MD = las decisiones; los JSX = la referencia visual/funcional.

## 1. Qué es el producto

**GastronomIA** — SaaS multi-tenant de control de rentabilidad con IA para restaurantes PyME de Lima. Caso de estudio: **Motif Restobar Karaoke** (San Juan de Lurigancho). Tesis UPC Ingeniería de Software, TP1 (2026-1) + TP2 (2026-2).

**3 pilares funcionales:**
1. **Forecasting de demanda** (Chronos-2 primary, Prophet fallback) — el frontend grafica predicciones con bandas P10/P90.
2. **Chat analítico Text-to-SQL** (Claude + RAG) — el frontend consume streaming SSE.
3. **Gestión BOM y costeo dinámico por plato** — CRUD de recetas, ingredientes, márgenes.

**Usuarios (personas):**

| Persona | Rol app | Qué usa |
|---|---|---|
| María Quispe (dueña) | `owner` | Dashboard KPIs, chat analítico, forecast, reportes, settings |
| Carlos Salazar (gerente) | `manager` | Dashboards, reportes, chat; settings solo lectura |
| Meseros/cocineros/cajeros | `staff` | POS, KDS, inventario (lectura), interfaz simplificada |

---

## 2. Stack frontend (DECIDIDO — no reevaluar)

| Capa | Tecnología | Notas |
|---|---|---|
| Framework | **Nuxt 3.16+** SSR híbrido | Landing SSR; `/app/**` como SPA island; Nitro como BFF |
| Base | Vue 3.5+ Composition API | `<script setup>` siempre |
| Tipado | TypeScript **estricto** | **PROHIBIDO `any`** (evidencia ABET SO7) |
| Estilos | Tailwind CSS v4 + **Nuxt UI** | Dashboard template oficial; theme con variables CSS |
| Gráficos | **vue-echarts** (Apache ECharts) | Forecast con bandas P10/P90, heatmaps, drill-down |
| Tablas | TanStack Table v8 (Vue) | Headless |
| Formularios | VeeValidate + **Zod v4** | Mismos schemas Zod que el backend (`packages/shared`) |
| Estado cliente | Pinia | Sesión, filtros de UI |
| Estado servidor | @pinia/colada | Data fetching/cache (rol de TanStack Query) |
| Auth | nuxt-auth-utils + Better-Auth | Ver §4 |
| Iconos | @nuxt/icon (Iconify) | Incluido con Nuxt UI |
| E2E | Playwright | Unit: Vitest |

**Deploy frontend:** Vercel. Backend NestJS 11 + Fastify (monolito modular) y servicios FastAPI (IA) en Hetzner con Coolify. BD: PostgreSQL 17 + pgvector (TimescaleDB **retirado** por ADR-007).

---

## 3. El prototipo (estos JSX) — qué es y qué NO es

- **46 pantallas en React 18** con CSS propio, deploy en https://gastronomia-prototipo.vercel.app/
- Es **proof-of-concept / referencia visual y de flujos**. El frontend real se escribe desde cero en Nuxt. **No portar el código React**; portar el diseño, los flujos y los textos.
- `screenshots/` contiene capturas de cada pantalla; `_capture-script`, `design-canvas.jsx`, `ios-frame.jsx`, `tweaks-panel.jsx` son herramientas del prototipo, no pantallas.

### Mapa de pantallas → archivos

| Módulo | Pantallas (archivos .jsx/.html) |
|---|---|
| Onboarding/Auth | `splash` (Splash Welcome), `onboarding` (Steps 1-5 + Done), `login`, `verify`, `forgot` (Forgot Password), `Success`, `restaurant`, `setup`, `done` |
| Dashboard | `Home` (overview KPIs), `Notifications`, `Profile`, `Help` |
| POS / Salón | `Pos`, `Menu`, `MesaDetail`, `MesaActionsSheet`, `OpenTableSheet`, `SplitBill`, `CobrarSheet` (cobros), `AdjustPrice`, `DiscountSheet` |
| Recetas / Catálogo | `Recipes`, `RecipeDetail`, `RecipeNew` + `RecipeNew2` + `RecipeNew3` (wizard 3 pasos), `ProductDetail`, `CatalogSheet` |
| Inventario | `Stock`, `MovimientoRapido`, `ShoppingList` |
| Ventas / Comprobantes | `Invoices`, `InvoiceDetail` |
| Chat analítico (IA) | `Chat` |
| Datos | `DataImport`, `DataExport`, `MagicUpload`, `import` |
| Settings | `SettingsBusiness`, `SettingsHours`, `SettingsMenu`, `SettingsPayments`, `SettingsTables`, `SettingsTax` |

---

## 4. Sistema de diseño (definido en `colors_and_type.css` — ÚSALO)

La identidad visual **ya está decidida**: "paleta cálida bistró: terracota, crema, espresso". Al montar Nuxt UI/Tailwind v4, mapear estos tokens al theme:

**Colores de marca:**

| Token | Valor | Uso |
|---|---|---|
| `--terracotta` | `#C96A43` | Acento principal (700: `#A8542F`, 300: `#E29A7E`, 100: `#F5DACE`) |
| `--espresso` | `#1A1A1A` | Texto y elementos primarios (800/600/400: `#2B2A28`/`#4A4744`/`#807B75`) |
| `--crema` | `#F3EDE4` | Fondo principal (200/100/50: `#EAE2D5`/`#F8F4ED`/`#FBF8F2`) |
| `--mostaza` | `#D8A441` | Secundario / warning (700: `#B0822E`, 100: `#F1DDB0`) |
| `--oliva` | `#6E7B61` | Secundario / success (700: `#525E47`, 100: `#D6DCCC`) |
| `--danger` | `#B33A2A` | Error (bg: `#F5D9D2`) |
| `--info` | `#4A6B7B` | Info (bg: `#D8E2E7`) |

**Tipografía:** `DM Sans` (sans, UI y headings), `Lora` *italic* (serif, display/editorial), `JetBrains Mono` (código/SQL en el chat). Escala base 15px (`--fs-base`), display 64px. TTFs en `fonts/`.

**Otros tokens:** spacing escala 4px (`--space-1..20`), radios 8px default / 12px cards (`--radius*`), sombras sutiles planas, focus ring terracota `rgba(201,106,67,0.28)`, motion `--dur` 200ms con `cubic-bezier(0.2,0,0.1,1)`.

---

## 5. Autenticación y multi-tenancy (CRÍTICO)

- JWT **RS256** (access 15 min, refresh 7 d) en **cookie httpOnly sellada** (iron-webcrypto). **El JWT nunca toca JavaScript.**
- El **BFF de Nitro** (server routes de Nuxt) inyecta `Authorization: Bearer` hacia la API NestJS. El cliente nunca llama a NestJS directo.
- Claims: `{ sub, tenant_id, roles: [owner|manager|staff] }`.
- **`tenant_id` SIEMPRE sale del JWT** — nunca del path, query ni body. La BD tiene RLS FORCE como segunda capa, pero el frontend/BFF también filtra.
- Roles → gating de UI: `owner` todo; `manager` sin escritura en settings; `staff` solo POS/KDS/inventario lectura.
- Better-Auth (plugin organization) maneja orgs/invitaciones; CASL en backend.

---

## 6. Integración con la API

- **REST + SSE** (GraphQL descartado). Prefijos de endpoints:
  `/api/auth/`, `/api/tenants/`, `/api/recipes/`, `/api/inventory/`, `/api/sales/`, `/api/forecasts/`, `/api/nl-query/stream`, `/api/reports/`.
- **Formato de respuesta** (schemas Zod compartidos en `packages/shared`):

```ts
ApiResponse<T> {
  success: boolean
  data: T
  error?: { code: string; message: string }
  meta?: { totalCount: number; page: number }
}
```

- **Chat analítico:** `EventSource` sobre `/api/nl-query/stream` — renderizado incremental: SQL generado → tabla de resultados → respuesta humanizada (Groq streaming).
- **Carga de CSV (TumiSoft):** upload multipart → pre-signed URL R2 → worker BullMQ valida fila a fila → progreso por SSE → UI muestra barra + errores por fila.
- **Forecast:** lectura de `/api/forecasts/` → chart ECharts con línea `yhat` y banda `yhat_lo`–`yhat_hi` (P10/P90).

---

## 7. Entidades que consume el frontend (resumen del modelo)

- **IAM:** `tenants`, `users`, `organizations`, `invitations` (roles owner/manager/staff).
- **Catálogo:** `ingredients` (+ `ingredient_price_history`), `recipes` (kind: `dish|sub_recipe`, `yield`, `sell_price`), `recipe_items` (ingrediente o sub-receta, `qty`, `waste_pct`), `units_of_measure` + conversiones.
- **Operación:** `sales` / `sale_items` (descuentos), `purchases` / `purchase_items`.
- **Inventario:** `inventory_movements` (source: purchase|sale|waste|adjustment|count_recon), `inventory_counts` + `inventory_count_lines` (varianza física vs sistema).
- **IA:** `forecasts` (yhat, yhat_lo, yhat_hi, target_date), `chat_conversations` / `chat_messages` (con SQL ejecutado), `weekly_reports` (markdown narrativo).
- **Ingesta:** `ingestions` (status queued|processing|success|error) + `ingestion_errors` (fila, campo, mensaje).

Convención BD: snake_case, `tenant_id NOT NULL`, soft delete (`deleted_at`), moneda **solo S/ (PEN)**, timezone **America/Lima**.

---

## 8. Alcance: épicas y prioridad (Product Backlog: 102 HU / 427 SP)

| Épica | Nombre | Sprint | Prioridad | Carga frontend |
|---|---|---|---|---|
| E01 | Identity, Multi-Tenancy, Seguridad | S1 | MUST | Login, signup, invitaciones, settings |
| E02 | Catálogo, Recetas y Menú | S1 | MUST | CRUD recetas + wizard, costeo visible |
| E03 | POS, Salón y Cocina (KDS) | S2 | MUST | **Frontend-intensivo**: POS, mesas, KDS |
| E04 | Tickets, Cobros y Pagos | S2 | MUST | Cobro, split bill, descuentos |
| E05 | Inventario, Compras y Mermas | S3 | MUST | Stock, conteos, varianzas |
| E06 | Costeo Dinámico y Márgenes | S3 | MUST | Vistas de margen por plato |
| E07 | Reportes, Dashboards y KPIs | S4 | SHOULD | **Frontend-intensivo**: overview, charts |
| E08 | Forecasting con IA | S4 | MUST | Vista forecast (ECharts) |
| E09 | Chat Analítico Text-to-SQL | S5 | MUST | **Frontend-intensivo**: chat SSE |
| E10 | Notificaciones y Alertas | S4 | SHOULD | Centro de notificaciones |
| E11 | Migración desde ERPs Legacy | S1 | SHOULD | Upload CSV + progreso |
| E12 | Plataforma, DevOps | S0 | MUST | Skeleton, CI |

**Fuera de alcance TP1 (NO construir):** CRM, reservas de mesas, turnos de personal, PWA offline, multi-sucursal, delivery, app nativa, facturación SUNAT, multi-moneda.

---

## 9. Requisitos UX y métricas de éxito (la tesis se mide con esto)

| Requisito | Valor |
|---|---|
| Usabilidad | **SUS ≥ 70** en piloto con usuarios reales de Motif |
| Latencia chat | **P95 < 2 s** (round-trip completo) |
| Bundle | **< 100 KB gzip** (vigilar imports de ECharts: usar tree-shaking) |
| Accesibilidad | **WCAG 2.1 AA** (verificar con axe devtools) |
| Responsive | **Mobile-first** — el restaurante opera con smartphones y WiFi inestable |
| Offline | Solo *awareness* (banner "sin conexión"); PWA queda para TP2 |
| Idioma | **Solo español peruano (es-PE)** en TP1; estructura i18n preparada para TP2 |

---

## 10. Convenciones de código y metodología

- **SDD — Spec-Driven Development (ADR-006):** spec primero en `/specs/eXX/HU-XX-YY-titulo.spec.md` → test rojo (Vitest) → implementación mínima → review. **No se mergea código sin spec.**
- **Branches:** `feat/HU-XX-YY-titulo` · **Commits:** `spec(HU-XX-YY): descripción`.
- **Naming TS:** camelCase variables/funciones, PascalCase tipos/componentes, **kebab-case archivos**. Código en inglés, docs en español.
- **Prohibido:** `any`, `console.log` (usar logger), catch silencioso, magic strings/numbers, credenciales hardcodeadas, `tenant_id` desde path/body.
- Zod como **única fuente de verdad de tipos** (inferir TS desde schemas compartidos).

---

## 11. Estado actual (2026-06-10) y decisiones de implementación

**Skeleton Sprint 0 COMPLETADO (2026-06-10).** Lo construido:

- **Theme** (`app/assets/css/main.css`): tokens de §4 mapeados a Tailwind v4 `@theme` (escalas 50–950: `terracotta`, `oliva`, `mostaza`, `ladrillo`=danger, `lago`=info, `espresso`=neutro cálido) + tokens `--ui-*` de Nuxt UI + tokens crudos del prototipo en `:root` para portar pantallas 1:1. Fuentes DM Sans/Lora variables locales (`app/assets/fonts/`); JetBrains Mono pendiente (se añade con E09).
- **Shell** (`app/layouts/app.vue`): bottom-nav móvil con safe-areas iOS (`components/nav/MobileTabBar.vue`) + sidebar desktop ≥1024px (`components/nav/DesktopSidebar.vue`); destinos en `composables/use-app-nav.ts`.
- **Pantallas:** landing SSR (`/`), login + forgot (portados del prototipo), Home completo (`/app` — KPIs, alertas IA, atajos, tip), menú "Más" (`/app/menu`), catch-all "en construcción" (`/app/[...slug]`) con mapa de épicas.
- **Auth scaffold:** `nuxt-auth-utils` (cookie sellada, sesión server-side) + middleware global que protege `/app/**` + endpoints mock `server/api/auth/{login,logout}.post.ts` con usuarios demo Motif (password en `NUXT_DEMO_PASSWORD`, `.env`). Se reemplaza por Better-Auth/NestJS en Sprint 1 manteniendo el contrato.
- **PWA:** `@vite-pwa/nuxt` con manifest GastronomIA (íconos generados desde `logo-symbol.svg`, theme crema, es-PE, standalone). SW desactivado en dev (`devOptions.enabled: false`); offline real queda para TP2.
- **Schemas compartidos:** `shared/schemas/auth.ts` (Zod) + `shared/types/api.ts` (`ApiResponse<T>`) — semilla de lo que migrará a `packages/shared` en el monorepo.

**Desviaciones registradas respecto a §2** (decididas al implementar):

| Tema | Doc decía | Implementado | Motivo |
|---|---|---|---|
| Nuxt | 3.16+ | **Nuxt 4.3** (estructura `app/`, carpeta `shared/`) | Versión actual estable; mismo modelo SSR/Nitro |
| Package manager | (bun.lock huérfano) | **npm** (Node 22) | bun no está instalado en la máquina de desarrollo |
| Formularios | VeeValidate + Zod | **UForm de Nuxt UI + Zod** | UForm valida con los mismos schemas Zod; una dependencia menos. Reevaluar si un wizard complejo (E02) lo exige |
| vue-echarts / TanStack Table | en stack base | **aún no instalados** | Se agregan en E07/E08 y E02 respectivamente, para cuidar el budget de bundle (<100 KB) |

- OE1 (SRS) y OE2 (arquitectura C4 + ADRs + 46 pantallas) ya tienen actas firmadas. OE3 (software desplegado) tiene demo esperada la semana 12 (2026-06-23).

## 11b. TODAS las pantallas portadas con fake API (2026-06-11)

**Decisión:** en lugar de seguir el orden del backlog, se portaron TODAS las pantallas del prototipo de una vez, con datos mock servidos por una **fake API en el BFF de Nitro** (`server/api/**` + `server/utils/mock-db.ts`). El contrato (rutas REST §6, `ApiResponse<T>`, SSE) es el mismo que expondrá NestJS: al integrar el backend real solo se reemplazan los handlers de Nitro por proxies — el cliente no cambia.

**Capa de datos:**
- `shared/types/domain.ts` — entidades de §7 tipadas (Recipe, DiningTable, Order, Sale, Ingredient, movimientos, settings, chat, ingestions).
- Mock DB en memoria con seeds realistas de Motif (sobrevive HMR; consistente con las alertas del Home: Limón Sutil crítico, ceviche 18 %, 14/20 mesas).
- Endpoints CRUD por dominio + **SSE real**: `/api/nl-query/stream` (chat guionado: SQL → tabla → respuesta por chunks) y `/api/ingestions/:id/events` (progreso de import con errores por fila). `/api/magic-upload` simula OCR de facturas.
- Composables @pinia/colada por dominio (`use-recipes`, `use-tables`, `use-inventory`, `use-sales`, `use-notifications`, `use-app-settings`, `use-chat`) con invalidación de caché.
- Primitivas UI: `UiBottomSheet` (port de sheet-styles), `UiScreenHeader`, `UiEmptyState` + clases globales del prototipo en `components.css`.

**Pantallas (~42 rutas):** onboarding completo (/welcome + 5 pasos + done, registro mock), POS completo (mapa de mesas con estados, detalle de mesa con comanda, catálogo, abrir mesa, descuento, ajustar precio, cobrar con QR mock que emite comprobante real, dividir cuenta por persona/items), Recetas (lista, detalle con BOM, wizard 3 pasos con margen en vivo), Stock (hub, movimiento rápido, historial, lista de compras que registra compras), Comprobantes (lista + ticket), Chat SSE, Notificaciones, Perfil, Ayuda, Datos (import con progreso SSE, export CSV real, magic upload), Settings (hub + 6 secciones con gating por rol).

**Tests visuales:** `npm run test:visual` (`scripts/visual-shots.mjs`) recorre todas las rutas con sesión demo en viewport iPhone + desktop y guarda capturas en `tests/visual/shots/` — esa carpeta es la "suite" de regresión visual del TP1. Typecheck estricto y build de producción pasan.

**Adaptación registrada:** `Invoices.jsx` del prototipo es historial de facturas de PROVEEDOR; se adaptó a comprobantes de VENTA emitidos (los genera el cobro del POS), que es lo que el dominio §7 modela. Las compras a proveedor viven en Magic Upload + movimientos de inventario.

## 11c. Estado de integración con el backend (2026-06-15)

- ✅ **Auth integrada y validada E2E.** El BFF proxea `login`/`register` a NestJS y **sella los tokens en la cookie** (`server/utils/backend.ts` → `establishSession`); `GET /api/users` y `PATCH /api/users/:id/role` proxeados con `backendFetch` (Bearer desde la sesión; el RBAC del backend se propaga). `NUXT_API_BASE` apunta al backend (3333 en dev).
- 🔲 **Pendiente — logout server-side (HU-01-08):** `server/api/auth/logout.post.ts` solo limpia la cookie; falta llamar a `POST /api/auth/logout` del backend para **revocar el refresh token**. El endpoint del backend ya existe (cambio chico, ver el TODO en ese archivo).
- ✅ **E02 (catálogo/recetas) integrado y validado E2E (2026-06-15).** `server/utils/e02-adapter.ts` es el **anti-corruption layer**: el backend separa `Recipe` (BOM/costo) de `MenuItem` (precio/margen/categoría); el BFF lo traduce al shape "receta = plato vendible" del frontend (las pantallas Vue **no cambian**). Integrado: `GET/POST /api/recipes`, `GET/PATCH/DELETE /api/recipes/:id` (un plato ⇔ Recipe+MenuItem; la categoría de menú se resuelve/crea por nombre), `GET /api/ingredients` + `PATCH /api/ingredients/:id`. Validado con servidor real: login→crear receta (cost 40/sellPrice 80/margen 50% + ítems con nombre real)→listar→detalle→borrar. **`stock`/`minStock` del insumo van a Inventario/E05** → se muestran como "pendiente" (`Ingredient.stockPending`).
- ✅ **Features E02 con UI (validadas E2E):** **importar CSV** de insumos (HU-02-02, botón en Stock → reporte con línea exacta, idempotente); **alerta de margen <25%** (HU-02-10, detalle de receta); **modificadores** (HU-02-11) y **disponibilidad horaria** (HU-02-13) en el detalle de receta (componente `RecipeExtras.vue`; el BFF resuelve el MenuItem desde el recipeId). 
- ✅ **Bloque admin E02 integrado (2026-06-15):** pantallas nuevas de administración de catálogo (el prototipo no las tenía), bajo `app/pages/app/settings/` y enlazadas desde el hub de Ajustes (sección "Catálogo", visible solo a owner/manager). Patrón BFF anti-corruption: rutas thin-passthrough con `backendFetch` (Bearer de la sesión; el backend devuelve shapes ya frontend-friendly y aplica CASL 'Catalog' → staff 403). Composables Pinia Colada con invalidación en `onSettled`. CSS compartido `app/assets/css/admin-catalog.css`.
  - **HU-02-03 unidades de medida:** `settings/units.vue` + `use-units.ts` + `server/api/units/**` (GET, POST, PATCH :id, DELETE :id, GET /convert). Muestra familia (masa/volumen/conteo) y factor a base.
  - **HU-02-04 categorías de insumo (jerárquicas):** `settings/catalog-categories.vue` + `use-catalog-categories.ts` + `server/api/catalog-categories/**` (ruta renombrada para no colisionar con menú). Árbol de 2 niveles desde la lista plana (`parentId`); el 409 de borrar-con-hijos del backend se muestra como toast.
  - **HU-02-05 proveedores:** `settings/suppliers.vue` + `use-suppliers.ts` + `server/api/suppliers/**` (GET, GET :id, POST, PATCH :id, DELETE :id). RUC 11 dígitos, contacto, lead time, términos de pago; búsqueda por nombre/RUC.
  - **HU-02-06 insumo↔proveedor:** `settings/product-suppliers.vue` + `use-product-suppliers.ts` + `server/api/product-suppliers/**`. Pantalla "insumo-first" (el backend lista por insumo): elegir insumo → asociar/quitar proveedores con último precio (llega como string) y preferido.
  - **Nota técnica:** se mejoró `server/utils/backend.ts` (`backendFetch`) para **propagar el mensaje de error del backend** (envelope `error.message`) en `statusMessage`/`data.message`, y se agregó `errorMessage()` en `app/utils/format.ts` para surfacing de 409 (RUC duplicado, categoría con hijos, proveedor ya asociado) como toasts.
- ✅ **E03 (POS / salón + órdenes) integrado (2026-06-15).** `server/utils/pos-adapter.ts` es el **anti-corruption layer**: traduce `TableView`/`OrderView` del backend al contrato del frontend (`DiningTable`/`Order`/`OrderItem`) sin tocar las pantallas Vue. Rutas BFF reescritas como proxy `backendFetch`: `GET /api/tables`, `GET /api/tables/:id` (→ `{table, order}`), `PATCH /api/tables/:id` (pedir cuenta = `status:'bill'`), `POST /api/tables/:id/open` (= `POST /api/orders {tableId, guests}` + re-GET de la mesa), `GET /api/orders/:id`, `POST /api/orders/:id/items` (resuelve **recipeId → menuItemId** vía `/api/menu/items`), `PATCH /api/orders/:id` (itemUpdates → `PATCH /items/:itemId`; `status:'void'` → `POST /void {reason}`), y la nueva `POST /api/orders/:id/send-to-kitchen`. Mapeos: estados de orden `sent_to_kitchen|served → 'open'`; ítem `ready → 'preparing'`; `unitPrice` string → number; `payments`/`discount` quedan vacíos/ignorados (son **E04 billing**, no expuesto aún).
  - **Void con razón (HU-03-11):** la UI ya recogía el motivo en `MesaActionsSheet.vue` ("Cerrar sin cobrar"); ahora se envía como `voidReason` en `usePatchOrder` → el BFF lo mapea a `POST /api/orders/:id/void {reason}` (el backend lo exige y libera la mesa). Si faltara, el BFF usa una razón genérica por defecto.
  - **Enviar a cocina (HU-03-06):** nuevo composable `useSendToKitchen()` + ruta proxy; el botón "Enviar a cocina" del detalle de mesa primero persiste los ítems del carrito (`addItems`) y luego llama `send-to-kitchen` (el backend rutea los pending a sus estaciones).
  - **🔲 waiter-name pendiente:** el backend solo expone `waiterId` (uuid) en `TableView`; mostrar el nombre del mesero requiere una vista backend (join a users) → `DiningTable.waiter` queda `undefined` (TODO marcado en el adapter, no rompe la UI).
  - ✅ **Cobro/pago integrado (ver E04 abajo):** `server/api/orders/:id/pay.post.ts` dejó de ser mock — ahora proxea `POST /api/orders/:id/pay` del backend.
- ✅ **KDS (cocina) integrado (HU-03-07/08/09) (2026-06-15).** Pantalla **nueva** (el prototipo no tenía KDS): `app/pages/app/cocina/index.vue` en `/app/cocina`, enlazada desde el hub "Más" (grupo Operación, "Cocina (KDS)"). Rutas BFF thin-passthrough con `backendFetch` (el backend ya devuelve shapes frontend-friendly → sin adapter): `GET /api/kitchen/stations`, `GET /api/kitchen/queue?stationId=<uuid?>` (reenvía `stationId`; vacío = todas), `PATCH /api/kitchen/items/:id` (`status: 'preparing'|'ready'`). Composable `use-kitchen.ts`: `useKitchenStations()`, `useKitchenQueue(stationId)`, `useStartItem()`/`useReadyItem()` (PATCH + invalidación de la cola en `onSettled`). UI: selector de estación (chips, "Todas"), tarjetas ordenadas por espera con `tableCode`→"Mesa X", plato ×qty, modificadores (chips), notas y `waitMinutes`; **las demoradas (`isLate`, >10 min) se resaltan en rojo**; botones "Iniciar" (pending→preparing) y "Listo" (preparing→ready) — un ítem `ready` sale de la cola al refrescar. Cocineros = staff; sin gating extra (todos leen/patch Kitchen).
  - **Polling (no hay SSE en el backend aún):** la pantalla refresca la cola cada 5 s con `useIntervalFn` (`@vueuse/core`, se limpia al desmontar) + botón de refresco manual; el composable fija `staleTime` bajo (5 s) para que cada refetch pegue de verdad al servidor y refresca al volver el foco/reconexión. **TODO: migrar a SSE cuando el backend lo exponga** (Pinia Colada 1.3 no tiene `refetchInterval` nativo → el temporizador vive en la pantalla).
- ✅ **E04 (cobros / comprobantes) integrado (2026-06-15).** Se extendió `server/utils/pos-adapter.ts` con el mapeo de billing (sin adapter nuevo: el `SaleView` del backend ≈ `Sale` del frontend, solo moneda string → number + coerción de enums vía `toFrontendSale`). Rutas BFF reescritas/añadidas como proxy `backendFetch`:
  - **Cobrar (HU-04-02/04/05/06):** `POST /api/orders/:id/pay` → `{order, sale}` (reusa el order-mapper + `toFrontendSale`). El total/IGV los calcula el backend desde los ítems vivos; el body sigue siendo el que ya enviaban las pantallas (`{payments, docType, customer?, customerDoc?}`). Propaga 400 (Σpagos < total) y 409 (orden ya cobrada). `usePayOrder`/`CobrarSheet` no cambian (el "servicio 10%" opcional solo sube el monto pagado, que siempre cubre el total).
  - **Comprobantes:** `GET /api/sales` y `GET /api/sales/:id` (reescritos a proxy; el BFF mantiene el filtro `q`/`docType` que igual hace la lista en cliente). `useSales`/`useSale` intactos.
  - **Anular ticket (HU-04-07):** nueva `POST /api/sales/:id/void {reason}` + composable `useVoidSale()` + **botón "Anular comprobante"** en el detalle (`invoices/[id].vue`, solo owner/manager y si está `issued`, con modal de motivo). El backend exige rol (CASL 'update' 'Sale') → staff 403; el estado `void` ya estaba diseñado (sello "ANULADA" + filtro "Anuladas").
  - **Pre-cuenta (HU-04-01):** nueva `GET /api/orders/:id/pre-bill` + composable `usePreBill()`; la acción "Pre-cuenta" de `MesaActionsSheet` ahora muestra el **total autoritativo del backend** (toast) además de marcar la mesa `bill`.
  - **Dividir cuenta (HU-04-03):** nueva `POST /api/orders/:id/split` + composable `useSplitOrder()`; la pantalla `pos/mesa/:id/split.vue` pide al backend los montos autoritativos — por persona (`mode:'equal', parts:n`) y por items (`mode:'items', assignments:[{label,itemIds}]` cuando todos los ítems están asignados) — con fallback al reparto local mientras llega la respuesta. El cobro sigue siendo **un solo `pay`** con la suma de los pagos recolectados (el split NO persiste; "un ticket por parte" es alcance futuro del backend).
  - **🔲 Cierre Z (HU-04-08) pendiente:** el backend ya lo expone (`GET/POST /api/cash-close`, `GET /api/cash-close/preview`), pero **no hay pantalla en el frontend** → no se integró (no hay UI que cablear). TODO: crear la pantalla de cierre de caja y proxear esas rutas.
- 🔲 **Rutas de dominio aún MOCK:** inventory / chat / ingestions / settings siguen sobre `server/utils/mock-db.ts` **hasta que el backend exponga esos dominios (E05…)**. Al existir, se reemplaza cada handler por `backendFetch(event, '/api/...')` (el cliente no cambia).
- 🔲 **Diferido por requerir correo (Resend):** invitaciones (HU-01-05) y recuperación de contraseña (HU-01-07) — ver `Product Backlog.md` / `specs/TRACEABILITY.md` del backend.
- Otros pendientes: Better-Auth (orgs), E07/E08 (reportes + forecast con vue-echarts — únicas pantallas sin prototipo).
