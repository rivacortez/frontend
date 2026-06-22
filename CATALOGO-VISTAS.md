# Catálogo de vistas por Bounded Context — GastronomIA Frontend (Nuxt 4)

> **Objetivo:** documentar para qué sirve CADA vista y a qué **bounded context** (core) pertenece, alineando cada vista con lo que realmente ES. Base para mantener todo ordenado y razonar la app por dominio.
> **Estado del repo:** rama `refactor/rutas-espanol` — rutas en español (excepciones en inglés: `pos`, `menu`). Build verde (✅ exit 0).
> **Bounded contexts:** los mismos del backend (E01–E12, ver `team-backend/specs/TRACEABILITY.md`).
> **Generado:** 2026-06-19 · leído de `frontend_context.md`, `README.md`, layouts, `use-app-nav.ts` y las 52 páginas.

## Convenciones de esta tabla

- **Ruta** = URL en español (carpeta = ruta en Nuxt).
- **Rol** = quién la usa (owner / manager / staff), según `use-app-nav.ts` + `auth.global.ts` + CASL.
- **📍** = la vista vive físicamente bajo otra carpeta (`/app/ajustes/…` o `/app/pos/mesa/…`) pero por función pertenece a ESTE bounded context. Es la clave de la alineación.

---

## E01 — Identity, Multi-Tenancy y Seguridad
> Acceso a la cuenta, alta de tenant/restaurante (onboarding) y configuración fiscal del local.

| Ruta | Archivo | Para qué sirve | Rol |
|------|---------|----------------|-----|
| `/` | `pages/index.vue` | Landing del producto + CTA a login/panel. | Público |
| `/bienvenida` | `pages/bienvenida.vue` | Bienvenida previa al registro (propuesta de valor). | Público |
| `/ingresar` | `pages/ingresar.vue` | Login email/contraseña (HU-01-01/02). Muestra credenciales demo. | Público |
| `/recuperar` | `pages/recuperar.vue` | Recuperar contraseña (HU-01-07). **Mock** — requiere Resend. | Público |
| `/registro` | `pages/registro/index.vue` | Wizard paso 1 — crear cuenta. | Público |
| `/registro/verificar` | `pages/registro/verificar.vue` | Paso 2 — verificar email por OTP. | Público |
| `/registro/restaurante` | `pages/registro/restaurante.vue` | Paso 3 — datos del restaurante (tenant). | Público |
| `/registro/configuracion` | `pages/registro/configuracion.vue` | Paso 4 — config inicial (mesas, horario, pagos). | Público |
| `/registro/importar` | `pages/registro/importar.vue` | Paso 5 — elegir fuente de datos (selector). *Ejecuta importación → E11.* | Público |
| `/registro/listo` | `pages/registro/listo.vue` | Paso 6 — éxito + checklist + CTA al panel. | Público |
| `/app/perfil` | `pages/app/perfil.vue` | Perfil del usuario + cambio de contraseña (HU-01-06). | Todos |
| 📍 `/app/ajustes/negocio` | `pages/app/ajustes/negocio.vue` | Datos fiscales del local: nombre, razón social, RUC, dirección (HU-01-10). | **Owner** |
| 📍 `/app/ajustes/horarios` | `pages/app/ajustes/horarios.vue` | Horarios de atención por día (HU-01-10). | **Owner** |

## E02 — Catálogo, Recetas y Menú
> Insumos, recetas (BOM), carta/menú y maestros del catálogo (unidades, categorías, proveedores).

| Ruta | Archivo | Para qué sirve | Rol |
|------|---------|----------------|-----|
| `/app/recetas` | `pages/app/recetas/index.vue` | Lista de recetas con margen %, costo, precio, disponibilidad (HU-02-07/09). | Todos |
| `/app/recetas/nueva` | `pages/app/recetas/nueva.vue` | Wizard 3 pasos: datos → BOM → resumen con costeo vivo. | Owner/Manager |
| `/app/recetas/[id]` | `pages/app/recetas/[id].vue` | Detalle de receta — BOM con costeo línea a línea, margen, editar. | Todos |
| 📍 `/app/ajustes/carta` | `pages/app/ajustes/carta.vue` | Preferencias de menú + disponibilidad de platos (HU-02-10/13). | **Owner** |
| 📍 `/app/ajustes/unidades` | `pages/app/ajustes/unidades.vue` | Unidades de medida — CRUD + factor a base (HU-02-03). | Owner/Manager |
| 📍 `/app/ajustes/categorias` | `pages/app/ajustes/categorias.vue` | Categorías de insumo jerárquicas — CRUD (HU-02-04). | Owner/Manager |
| 📍 `/app/ajustes/proveedores` | `pages/app/ajustes/proveedores.vue` | Proveedores — CRUD (RUC, lead time, términos) (HU-02-05). | Owner/Manager |
| 📍 `/app/ajustes/insumo-proveedor` | `pages/app/ajustes/insumo-proveedor.vue` | Asociación insumo↔proveedor + precio/preferido (HU-02-06). | Owner/Manager |

## E03 — POS, Salón y Cocina/KDS
> Mapa de mesas, toma de comanda, cocina (KDS) y configuración del salón.

| Ruta | Archivo | Para qué sirve | Rol |
|------|---------|----------------|-----|
| `/app/pos` | `pages/app/pos/index.vue` | Mapa de mesas con estados, filtro por zona, resumen de caja (HU-03-03). | Todos |
| `/app/pos/mesa/[id]` | `pages/app/pos/mesa/[id]/index.vue` | Detalle de mesa — comanda: catálogo, carrito, enviar a cocina. *El cobro deriva a E04.* | Todos |
| `/app/cocina` | `pages/app/cocina/index.vue` | Kitchen Display — cola FIFO por estación, tiempos, Iniciar/Listo (HU-03-06/09). | Todos |
| 📍 `/app/ajustes/mesas` | `pages/app/ajustes/mesas.vue` | Zonas y mesas — CRUD con reorden, capacidad (HU-03-01/02). | Owner/Manager |

## E04 — Tickets, Cobros y Pagos
> Cobro, división de cuenta, comprobantes (boleta/factura), cierre Z y configuración de IGV/pagos.

| Ruta | Archivo | Para qué sirve | Rol |
|------|---------|----------------|-----|
| 📍 `/app/pos/mesa/[id]/dividir` | `pages/app/pos/mesa/[id]/dividir.vue` | Dividir cuenta — por personas o por ítems, cobro individual (HU-04-03). | Todos |
| `/app/comprobantes` | `pages/app/comprobantes/index.vue` | Lista de boletas/facturas — filtros, búsqueda, distribución horaria. | Todos |
| `/app/comprobantes/[id]` | `pages/app/comprobantes/[id].vue` | Ticket — ítems, IGV, total, compartir/imprimir, anular (HU-04-07). | Todos |
| `/app/cierre` | `pages/app/cierre.vue` | Cierre Z — total bruto, desglose por método, cerrar turno (HU-04-08). | Owner/Manager |
| 📍 `/app/ajustes/impuestos` | `pages/app/ajustes/impuestos.vue` | IGV (% e incluido) + series de boleta/factura. | **Owner** |
| 📍 `/app/ajustes/pagos` | `pages/app/ajustes/pagos.vue` | Métodos de pago + % de servicio sugerido. | **Owner** |

## E05 — Inventario, Compras y Mermas
> Stock de insumos, movimientos, mermas, lista de compras y órdenes de compra.

| Ruta | Archivo | Para qué sirve | Rol |
|------|---------|----------------|-----|
| `/app/inventario` | `pages/app/inventario/index.vue` | Hub — insumos con estado de stock (OK/Bajo/Crítico), costo, filtros. | Todos |
| `/app/inventario/producto/[id]` | `pages/app/inventario/producto/[id].vue` | Detalle de insumo — stock, mínimo, historial, movimiento rápido. | Todos |
| `/app/inventario/movimiento` | `pages/app/inventario/movimiento.vue` | Registrar movimiento (entrada/salida), motivo, nota en merma. | Todos |
| `/app/inventario/movimientos` | `pages/app/inventario/movimientos.vue` | Historial de movimientos con filtro por tipo. | Todos |
| `/app/inventario/mermas` | `pages/app/inventario/mermas.vue` | Resumen de mermas — costo perdido + detalle (HU-05-01). | Todos |
| `/app/inventario/lista-compras` | `pages/app/inventario/lista-compras.vue` | Lista de compras desde alertas de stock; registrar o compartir. | Todos |
| `/app/inventario/ordenes-compra` | `pages/app/inventario/ordenes-compra/index.vue` | Órdenes de compra — CRUD + estados, recepción parcial/total (HU-05-04/07). | Owner/Manager |

## E06 — Costeo Dinámico y Márgenes
> Costeo por período, food cost, sugerencia de precio y costos indirectos (CIF).

| Ruta | Archivo | Para qué sirve | Rol |
|------|---------|----------------|-----|
| `/app/costeo` | `pages/app/costeo/index.vue` | Costeo por período — food cost %, margen, sugerencia de precio, cierre mensual (HU-06-01/05). | **Owner** |
| 📍 `/app/ajustes/costos-indirectos` | `pages/app/ajustes/costos-indirectos.vue` | CIF mensuales — CRUD por período (HU-06-02). | Owner/Manager |

## E07 — Reportes, Dashboards y KPIs
> Dashboard de entrada y reportes analíticos (ventas, Pareto, inventario, food cost, mermas).

| Ruta | Archivo | Para qué sirve | Rol |
|------|---------|----------------|-----|
| `/app` | `pages/app/index.vue` | **Home/Dashboard** — KPIs reales, top platos, alertas, atajos. Contenido por rol. | Todos |
| `/app/reportes` | `pages/app/reportes/index.vue` | Hub con tabs: Dashboard, Ventas, Platos (Pareto/ABC), Inventario, Food cost, Mermas. Exporta CSV (HU-07-01/10). | Todos* |

\* staff ve solo el dashboard de caja; owner/manager ven todos los tabs.

## E08 — Forecasting (IA)
> **Sin vistas todavía.** El backend ya expone `GET /forecasting/predictions` y `GET /forecasting/validation`.

| Ruta | Archivo | Para qué sirve | Rol |
|------|---------|----------------|-----|
| *(pendiente)* | — | **Pronósticos** — consumir `GET /forecasting/predictions`. | Owner/Manager |
| *(pendiente)* | — | **Validación del modelo** — consumir `GET /forecasting/validation` (MAPE). | Owner/Manager |

## E09 — Chat / Analítica conversacional (IA)
> Consultas en lenguaje natural (text-to-SQL).

| Ruta | Archivo | Para qué sirve | Rol |
|------|---------|----------------|-----|
| `/app/chat` | `pages/app/chat.vue` | Chat text-to-SQL con streaming SSE: preguntas sugeridas, respuestas SQL→tabla→texto. **Mock** (conecta a NestJS en E09). | Todos |

## E10 — Notificaciones y Alertas
> Bandeja y preferencias de notificación.

| Ruta | Archivo | Para qué sirve | Rol |
|------|---------|----------------|-----|
| `/app/notificaciones` | `pages/app/notificaciones.vue` | Bandeja (nuevas/anteriores) + preferencias por canal/tipo (HU-10-01/03). Badge en header. | Todos |

## E11 — Migración desde ERPs Legacy / Ingesta de datos
> Migración guiada, importación/exportación de datos y captura por IA.

| Ruta | Archivo | Para qué sirve | Rol |
|------|---------|----------------|-----|
| `/app/migracion` | `pages/app/migracion/index.vue` | Wizard guiado (5 pasos) — config fiscal + importar insumos + histórico de ventas (HU-11-01). | Owner/Manager |
| `/app/datos/importar` | `pages/app/datos/importar.vue` | Importar ventas (CSV/Excel) con progreso SSE + historial (HU-11-03/05). | Owner/Manager |
| `/app/datos/exportar` | `pages/app/datos/exportar.vue` | Exportar datos (ventas/insumos/recetas) por rango → CSV. | Todos |
| `/app/datos/factura-ia` | `pages/app/datos/factura-ia.vue` | Magic Upload — OCR IA de factura → compras. *Crea movimientos de E05.* | Owner/Manager |

## E12 — Plataforma (shell, navegación, soporte)
> Cáscara de la app: hubs de navegación, soporte y manejo de errores.

| Ruta | Archivo | Para qué sirve | Rol |
|------|---------|----------------|-----|
| `/app/menu` | `pages/app/menu.vue` | Hub **Más** — accede a todos los módulos (Operación, Datos, Cuenta) + cerrar sesión. | Todos |
| `/app/ajustes` | `pages/app/ajustes/index.vue` | Hub de **Ajustes** — enlaza las sub-vistas de config (que pertenecen a E01/E02/E03/E04/E06). | Todos |
| `/app/ayuda` | `pages/app/ayuda.vue` | Centro de soporte — FAQ, contacto, primeros pasos. | Todos |
| `/app/[...slug]` | `pages/app/[...slug].vue` | 404 dentro de `/app` — ruta intentada + volver al inicio. | Todos |

---

## Hallazgo clave de alineación: la carpeta `/app/ajustes/` cruza 5 contextos

La carpeta `/app/ajustes/*` es una **agrupación de UI** (todo lo configurable junto), pero sus 11 sub-vistas pertenecen a **bounded contexts distintos**:

| Sub-vista de ajustes | Bounded context real |
|----------------------|----------------------|
| `negocio`, `horarios` | **E01** (config del tenant) |
| `carta`, `unidades`, `categorias`, `proveedores`, `insumo-proveedor` | **E02** (catálogo) |
| `mesas` | **E03** (salón) |
| `impuestos`, `pagos` | **E04** (facturación/cobros) |
| `costos-indirectos` | **E06** (costeo) |

**Implicancia:** "Ajustes" es correcto como **entrada de navegación** (el usuario espera "toda la config en un lugar"), pero NO es un bounded context. Si en algún momento se refactoriza el código por dominio (composables/components/stores por context), estas vistas deben razonarse según su contexto real, no según la carpeta `ajustes`.

Lo mismo aplica, en menor escala, a:
- `/app/pos/mesa/[id]/dividir` → vive bajo POS (E03) pero es **cobro (E04)**.
- `/registro/importar` → vive en onboarding (E01) pero dispara **ingesta (E11)**.
- `/app/datos/factura-ia` → ingesta (E11) que termina creando **movimientos de inventario (E05)**.

---

## Resumen por bounded context

| Context | Nombre | Vistas |
|---------|--------|-------:|
| E01 | Identity, Multi-Tenancy y Seguridad | 13 |
| E02 | Catálogo, Recetas y Menú | 8 |
| E03 | POS, Salón y Cocina/KDS | 4 |
| E04 | Tickets, Cobros y Pagos | 6 |
| E05 | Inventario, Compras y Mermas | 7 |
| E06 | Costeo Dinámico y Márgenes | 2 |
| E07 | Reportes, Dashboards y KPIs | 2 |
| E08 | Forecasting (IA) | 0 *(pendiente)* |
| E09 | Chat / Analítica conversacional | 1 |
| E10 | Notificaciones y Alertas | 1 |
| E11 | Migración / Ingesta de datos | 4 |
| E12 | Plataforma (shell) | 4 |
| | **Total** | **52** |
