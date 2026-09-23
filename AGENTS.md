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

## Deploy (Vercel)

```sh
npm run build              # production build (eslint errors ignored)
vercel --prod --token=$env:VERCEL_TOKEN  # deploy to production
```

`VERCEL_TOKEN` stored as User env var (`vcp_5tLF...`). Deploy alias: `goodlife-event-tickets.vercel.app`. Domain `goodlife.smwhr.space` points to Vercel DNS.

Vercel project env vars managed via dashboard (not `.env`): `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `APP_URL`, `DATABASE_URL`, `SUPABASE_*`, `GEMINI_API_KEY`, `DARAJA_*`, `WHATSAPP_*`.

## Architecture

- **Dual database**: Supabase (`@supabase/ssr` via `utils/supabase/`) and Neon PostgreSQL (raw `pg` pool via `lib/neon-client.ts`). Main data layer is `lib/supabase-db.ts` — isomorphic file with server-side `pg` queries and client-side `localStorage`/`fetch` fallbacks guarded by `typeof window === "undefined"`.
- **Payments — PayHero (primary, live)**: M-Pesa STK push via `lib/payhero.ts`; checkout exposes only "Pay with M-Pesa". Paystack is **disabled by default** — hidden behind `NEXT_PUBLIC_ENABLE_PAYSTACK=true` (all routes/code kept, requires redeploy to re-enable since `NEXT_PUBLIC_*` is baked at build time).
- **PayHero fee float (critical)**: transaction fees are deducted from the PayHero **service wallet**, NOT from the incoming payment (till settles separately). If the wallet hits 0, new collections **fail**. The initialize route has a low-balance guard (`lib/payhero-alerts.ts`, cooldown-throttled) that WhatsApp-alerts operators; hard-blocks STK at zero balance. Threshold: `PAYHERO_MIN_BALANCE` (default 50).
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
| `lib/payhero.ts` | Typed PayHero client: STK push, status lookup, wallet balance |
| `lib/payhero-fulfill.ts` | Shared fulfillment: log → tickets → WhatsApp → operator notify (idempotent) |
| `lib/payhero-alerts.ts` | Cooldown-throttled operator WhatsApp alerts (low fee float) |
| `app/api/payhero/initialize/route.ts` | Tier lookup → pending payment → STK push, with fee-float guard |
| `app/api/payhero/callback/route.ts` | PayHero webhook: token-guarded, `external_reference` match → tickets |
| `app/api/payhero/verify/route.ts` | Payment status polling (DB-first, PayHero API fallback) |
| `app/api/paystack/*` | Legacy Paystack flow — disabled unless `NEXT_PUBLIC_ENABLE_PAYSTACK=true` |
| `components/ui/haptic-feedback.ts` | Vibration patterns (success/confirmation/error), progressive enhancement |
| `scripts/` | DB schema migration and seeding scripts |

## Env vars (see `.env.example`)

`GEMINI_API_KEY`, `APP_URL`, `DATABASE_URL`, Supabase (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`), **PayHero** (`PAYHERO_USERNAME`, `PAYHERO_PASSWORD`, `PAYHERO_CHANNEL_ID` = till channel, `PAYHERO_CALLBACK_TOKEN`, `PAYHERO_MIN_BALANCE`), Paystack (`PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, toggle `NEXT_PUBLIC_ENABLE_PAYSTACK`), Daraja M-Pesa (`DARAJA_*`), WhatsApp gateway (`WHATSAPP_*`, `OPERATOR_WHATSAPP_NUMBERS`).

## Quirks & conventions

- **Tailwind v4** uses `@import "tailwindcss"` in `app/globals.css` — no `tailwind.config.js`.
- **`motion`** library must be transpiled — already set in `next.config.ts` `transpilePackages`.
- **Build output**: `output: 'standalone'` in `next.config.ts`.
- **HMR** disabled via `DISABLE_HMR=true` env var (for AI Studio agent compatibility).
- **PDF tickets** require `public/BebasNeue.ttf` at runtime.
- **Design tokens** (Tailwind v4 `@theme` in `globals.css`): typography via `text-caption` / `text-footnote` / `text-body` (11/12/14px, HIG-aligned floors) — never `text-[Npx]`; brutalist shadows via `shadow-(--shadow-brut-*)` tokens — never inline `shadow-[...]`. Haptic feedback on payment success/confirm/error via `HapticFeedback.trigger()`.
- No automated tests, no CI/CD. Originally an AI Studio applet (`metadata.json`).
- Installed skills: supabase, supabase-postgres-best-practices (see `skills-lock.json`).
- Page `<title>` in `app/layout.tsx` is still the AI Studio default — update for production.
