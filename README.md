# GastronomIA — Frontend

SaaS multi-tenant de **control de rentabilidad con IA para restaurantes PyME** (tesis UPC, caso de estudio: Motif Restobar Karaoke). PWA construida con **Nuxt 4** que opera como demo funcional completa: todas las pantallas del prototipo están implementadas sobre una **fake API** en el BFF de Nitro con el mismo contrato que expondrá el backend real (NestJS).

> Contexto completo de decisiones en [`frontend_context.md`](./frontend_context.md) (§11 y §11b describen el estado actual).

## Stack

Nuxt 4 · Nuxt UI v4 (Tailwind v4) · TypeScript estricto · Pinia + @pinia/colada · nuxt-auth-utils (sesión en cookie sellada) · @vite-pwa/nuxt · Zod v4

## Setup

```bash
npm install
cp .env.example .env   # genera un NUXT_SESSION_PASSWORD propio (32+ chars)
npm run dev            # http://localhost:3000
```

**Credenciales demo** (password = `NUXT_DEMO_PASSWORD`, por defecto `MotifDemo2026`):

| Email             | Rol                             |
| ----------------- | ------------------------------- |
| `maria@motif.pe`  | owner (todo)                    |
| `carlos@motif.pe` | manager (settings solo lectura) |
| `staff@motif.pe`  | staff                           |

## Scripts

| Comando               | Qué hace                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`         | Dev server con HMR                                                                                                                                                                          |
| `npm run build`       | Build de producción (Nitro)                                                                                                                                                                 |
| `npm run preview`     | Sirve el build localmente                                                                                                                                                                   |
| `npx nuxt typecheck`  | TypeScript estricto (cero `any`)                                                                                                                                                            |
| `npm run test:visual` | **Tests visuales**: recorre todas las rutas con sesión demo (iPhone + desktop) y guarda capturas en `tests/visual/shots/` (requiere dev server corriendo y Chromium de Playwright en caché) |

## Arquitectura de la demo (fake API)

- **El cliente nunca llama a un backend externo**: consume `server/api/**` (BFF de Nitro) vía composables de `@pinia/colada` (`app/composables/use-*.ts`).
- Los datos viven en un **mock DB en memoria** (`server/utils/mock-db.ts`) con seeds realistas. Los flujos mutan estado de verdad: abrir mesa → comanda → cobrar genera el comprobante y libera la mesa.
- **SSE real**: chat analítico (`/api/nl-query/stream`) e importación con progreso (`/api/ingestions/:id/events`).
- **Swap a backend real**: los handlers de Nitro se reemplazan por proxies hacia NestJS manteniendo `ApiResponse<T>` y las rutas — el cliente no cambia.

El prototipo de referencia (React, 46 pantallas) **no se versiona** (`gastronomia-v2/` está en `.gitignore`): ya fue implementado al 100 % y los assets necesarios (fuentes, logos) se copiaron a `app/assets/` y `public/`.

## Deploy

### Variables de entorno (obligatorias en producción)

| Variable                | Descripción                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `NUXT_SESSION_PASSWORD` | Secreto de la cookie de sesión sellada (mínimo 32 caracteres aleatorios). **Sin ella el login falla en prod.** |
| `NUXT_DEMO_PASSWORD`    | Password de las cuentas demo                                                                                   |
| `NUXT_API_BASE`         | URL base del Render backend (NestJS). Requerida cuando el BFF de Nitro opera en modo proxy hacia la API real.  |

### Opción recomendada: contenedor Node (Coolify / Railway / Render / Fly)

La demo guarda estado en memoria del proceso, así que necesita **un solo proceso Node de larga vida** para que los flujos (abrir mesa, cobrar, importar) sean consistentes durante toda la sesión de demo.

```bash
docker build -t gastronomia-frontend .
docker run -p 3000:3000 \
  -e NUXT_SESSION_PASSWORD="<redacted>" \
  -e NUXT_DEMO_PASSWORD="<redacted>" \
  gastronomia-frontend
```

En **Coolify** (ya previsto en la infraestructura del proyecto): nueva app → este repo → build con Dockerfile → definir las 2 variables → deploy. Railway/Render detectan el Dockerfile automáticamente.

### Vercel (con caveat)

Funciona zero-config (preset Nitro), define las mismas variables en el dashboard. **Caveat**: en serverless cada lambda tiene su propia memoria, por lo que el estado del mock puede divergir o reiniciarse entre requests (cada cold start re-siembra los datos). Para mostrar la UI alcanza; para una demo guiada de flujos POS usa la opción de contenedor. Cuando exista la API NestJS este caveat desaparece (el BFF pasa a ser stateless) y Vercel vuelve a ser el destino natural del frontend.

### Vercel + Render backend (integración real)

Cuando el Render backend (NestJS) esté desplegado, configurar `NUXT_API_BASE` apuntando a su URL antes del deploy:

```bash
# Verificar el build antes de publicar
vercel deploy --dry --cwd frontend

# Registrar la variable de producción (apunta al Render backend)
vercel env add NUXT_API_BASE production --cwd frontend
```

El BFF de Nitro reemplaza los handlers de `server/api/**` por proxies hacia `NUXT_API_BASE`, manteniendo el contrato `ApiResponse<T>` — el cliente no cambia.
