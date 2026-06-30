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

**Credenciales demo** (`NUXT_DEMO_PASSWORD=<redacted>`; configure the real value only in the provider or local `.env`):

| Email | Rol |
|---|---|
| `maria@motif.pe` | owner (todo) |
| `carlos@motif.pe` | manager (settings solo lectura) |
| `staff@motif.pe` | staff |

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Dev server con HMR |
| `npm run build` | Build de producción (Nitro) |
| `npm run preview` | Sirve el build localmente |
| `npx nuxt typecheck` | TypeScript estricto (cero `any`) |
| `npm run test:visual` | **Tests visuales**: recorre todas las rutas con sesión demo (iPhone + desktop) y guarda capturas en `tests/visual/shots/` (requiere dev server corriendo y Chromium de Playwright en caché) |

## Arquitectura de la demo (fake API)

- **El cliente nunca llama a un backend externo**: consume `server/api/**` (BFF de Nitro) vía composables de `@pinia/colada` (`app/composables/use-*.ts`).
- Los datos viven en un **mock DB en memoria** (`server/utils/mock-db.ts`) con seeds realistas. Los flujos mutan estado de verdad: abrir mesa → comanda → cobrar genera el comprobante y libera la mesa.
- **SSE real**: chat analítico (`/api/nl-query/stream`) e importación con progreso (`/api/ingestions/:id/events`).
- **Swap a backend real**: los handlers de Nitro se reemplazan por proxies hacia NestJS manteniendo `ApiResponse<T>` y las rutas — el cliente no cambia.

El prototipo de referencia (React, 46 pantallas) **no se versiona** (`gastronomia-v2/` está en `.gitignore`): ya fue implementado al 100 % y los assets necesarios (fuentes, logos) se copiaron a `app/assets/` y `public/`.

## Deploy

The production demo frontend targets **Vercel** from the `frontend/` directory. Keep browser and Nuxt client code on `/api/**`; Nitro server handlers stay as the BFF layer and proxy to the Render NestJS backend through `NUXT_API_BASE`.

### Required Vercel environment names

Configure names only in code/docs. Add real values through the Vercel dashboard or interactive CLI prompts; do not commit or print secret values.

| Variable | Purpose | Example value policy |
|---|---|---|
| `NUXT_SESSION_PASSWORD` | Sealed session-cookie secret for `nuxt-auth-utils` | 32+ random characters, secret value never committed |
| `NUXT_DEMO_PASSWORD` | Demo account password | Secret value managed in Vercel |
| `NUXT_API_BASE` | Render backend base URL consumed by Nitro BFF handlers | Provider URL only, for example the Render backend origin |

### Vercel quick path

Run these from the composite workspace root after reviewing the Vercel project target. The commands name variables but never include their values inline.

```bash
vercel deploy --dry --cwd frontend
vercel env add NUXT_SESSION_PASSWORD production --cwd frontend
vercel env add NUXT_DEMO_PASSWORD production --cwd frontend
vercel env add NUXT_API_BASE production --cwd frontend
vercel deploy --prod --cwd frontend
```

`NUXT_API_BASE` must point to the Render backend that exposes `/api/health` and the NestJS API. The frontend should continue calling local `/api/**` routes so the client does not need to know provider internals.

### Local container option

The older mock-only demo can still run as a single long-lived Node container for local walkthroughs. In the linked provider demo, prefer Vercel + Render + Supabase so the BFF is stateless and deployment checks can verify all services.

```bash
docker build -t gastronomia-frontend .
docker run -p 3000:3000 \
  -e NUXT_SESSION_PASSWORD="<redacted>" \
  -e NUXT_DEMO_PASSWORD="<redacted>" \
  -e NUXT_API_BASE="<render-backend-origin>" \
  gastronomia-frontend
```
