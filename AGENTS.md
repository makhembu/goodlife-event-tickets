# GOODLIFE Event Tickets

Next.js 15 App Router + TypeScript + Tailwind v4 + Supabase/Neon dual DB.

## Commands

```sh
npm run dev       # Next.js dev server
npm run build     # production build (eslint errors ignored — see next.config.ts)
npm run start     # start production server
npm run lint      # ESLint (flat config, eslint-config-next)
npm run clean     # next clean
```

## Architecture

- **Dual database**: Supabase (`@supabase/ssr` via `utils/supabase/`) and Neon PostgreSQL (raw `pg` pool via `lib/neon-client.ts`). Main data layer is `lib/supabase-db.ts` — isomorphic file with server-side `pg` queries and client-side `localStorage`/`fetch` fallbacks guarded by `typeof window === "undefined"`.
- **Admin auth**: hardcoded credentials `admin@goodlife.com` / `GoodlifeAdmin2026!` (`app/api/admin/login/route.ts`). Session stored in cookie `goodlife_admin_session=true` (1 day TTL, httpOnly). No Supabase Auth used for admin.
- **Middleware** (`middleware.ts`) protects `/admin/*` and redirects `/login` if already authed.
- **Path alias**: `@/*` maps to project root.

## Key source files

| File | Purpose |
|------|---------|
| `lib/supabase-db.ts` | Main data access layer (Neon SQL + localStorage fallbacks) |
| `lib/neon-client.ts` | `pg.Pool` singleton for Neon |
| `lib/ticket-generator.ts` | PDF ticket generation via `pdf-lib` + QR codes (needs `public/BebasNeue.ttf`) |
| `lib/whatsapp.ts` | WhatsApp delivery via configurable gateway |
| `app/page.tsx` | Checkout page with dev simulation panel |
| `app/admin/dashboard/page.tsx` | Admin CRUD + metrics |
| `app/admin/scanner/page.tsx` | QR + manual ticket verification |
| `app/api/mpesa/stkpush/route.ts` | M-Pesa STK Push initiation |
| `app/api/mpesa/callback/route.ts` | Callback webhook + ticket creation |
| `scripts/` | DB schema migration and seeding scripts |

## Env vars (see `.env.example`)

`GEMINI_API_KEY`, `APP_URL`, `DATABASE_URL`, Supabase (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`), Daraja M-Pesa (`DARAJA_*`), WhatsApp gateway.

## Quirks & conventions

- **Tailwind v4** uses `@import "tailwindcss"` in `app/globals.css` — no `tailwind.config.js`.
- **`motion`** library must be transpiled — already set in `next.config.ts` `transpilePackages`.
- **Build output**: `output: 'standalone'` in `next.config.ts`.
- **HMR** disabled via `DISABLE_HMR=true` env var (for AI Studio agent compatibility).
- **PDF tickets** require `public/BebasNeue.ttf` at runtime.
- No automated tests, no CI/CD. Originally an AI Studio applet (`metadata.json`).
- Installed skills: supabase, supabase-postgres-best-practices (see `skills-lock.json`).
- Page `<title>` in `app/layout.tsx` is still the AI Studio default — update for production.
