# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run dev        # Next.js 15 dev server (uses DISABLE_HMR=true to suppress agent edit flicker)
npm run build      # Production build (output: standalone, eslint-errors ignored)
npm run start      # Start production server
npm run lint       # Flat ESLint config (ignoreDuringBuilds: true in next.config.ts)
npm run clean      # next clean
```

## Architecture

**Next.js 15 App Router + TypeScript + Tailwind v4 + Dual PostgreSQL (Supabase + Neon).**

### Data Layer

- **Dual database**: Supabase (`@supabase/ssr`) for client-side RLS; Neon PostgreSQL (raw `pg` pool via `lib/neon-client.ts`) for server-side heavy ops.
- **`lib/supabase-db.ts`** is the main data access layer — isomorphic file. Server-side code uses Neon `pg` pool directly; client-side falls back to `localStorage` or `fetch`-to-API guarded by `typeof window === "undefined"`.
- **Auth**: Admin creds (`admin@goodlife.com` / `<set in env: ADMIN_PASSWORD>`). Cookie-based session (`goodlife_admin_session=true`, 1 day). No Supabase Auth for admin. See `app/api/admin/login/route.ts`.
- **Tables**: `tickets` (soft-delete via `deleted_at`), `event_details` (singleton row id=1), `pending_payments` (orphaned M-Pesa), `ticket_tiers` (soft-delete), `payment_logs` (webhook audit).

### Payment Flow

M-Pesa via Paystack (STK Push). Flow: `app/page.tsx` → `/api/paystack/initialize` → user enters PIN → poll `/api/paystack/verify` → callback creates ticket → WhatsApp delivery.

### Key Files

| File | Purpose |
|------|---------|
| `app/page.tsx` | Checkout page — tier selection, M-Pesa pay, ticket vault |
| `app/admin/dashboard/page.tsx` | Admin CRUD + metrics + event settings + trash |
| `app/admin/scanner/page.tsx` | QR scanner (html5-qrcode) + manual lookup + scan results |
| `app/login/page.tsx` | Admin login with gate-terminal aesthetic |
| `lib/supabase-db.ts` | All DB operations — full CRUD + metrics + payments (isomorphic) |
| `lib/neon-client.ts` | `pg.Pool` singleton for Neon |
| `lib/ticket-generator.ts` | PDF ticket via pdf-lib + QR + BebasNeue.ttf |
| `lib/whatsapp.ts` | WhatsApp delivery (Whapi/OpenWA/Waha/Evolution), operator alerts, scan notifications |
| `lib/admin-auth.ts` | Middleware auth check helper (`requireAdmin()`) |
| `middleware.ts` | Protects `/admin/*`, API routes, login redirect |
| `app/globals.css` | Tailwind v4 `@import "tailwindcss"` + custom theme colors + marquee animation |
| `app/layout.tsx` | Root layout — SSR dynamic metadata from `event_details` table |

### Design System

See `DESIGN.md`. Custom Tailwind v4 theme in `app/globals.css`: brand-navy (#142B4C), brand-accent (#C79A56), brand-off-white (#F3ECE1). Two fonts: Space Grotesk (body) + Bebas Neue (display). Brutalist aesthetic — hard shadows, thick borders, uppercase-heavy.

### API Routes

- `/api/admin/scan/[ticketId]` — POST: verify ticket (idempotent)
- `/api/admin/tickets` — GET/POST: list/create tickets
- `/api/admin/tickets/[id]` — GET/PUT/DELETE: single ticket ops
- `/api/ticket-tiers` — GET/POST: list/create tiers
- `/api/ticket-tiers/[id]` — PUT/DELETE: tier update/soft-delete
- `/api/event-details` — GET/PUT: event config singleton
- `/api/paystack/{initialize,verify,callback}` — payment lifecycle
- `/api/admin/pending-payments` — GET/POST/DELETE: orphaned payment resolution
- `/api/admin/payment-logs` — GET/DELETE: payment audit logs

### Quirks

- **Tailwind v4** — no `tailwind.config.js`. Theme vars in `@theme` directive in `globals.css`.
- **DAISYUI / shadcn** — not used. Pure Tailwind + custom components.
- **`motion` (framer-motion)** — must be in `transpilePackages` (already set in next.config.ts).
- **HMR disabled** — `DISABLE_HMR=true` env var prevents flicker during AI agent edits.
- **Build** uses `output: "standalone"`. PDF generation requires `public/BebasNeue.ttf`.
- **No test suite** — no CI/CD. Originally an AI Studio project (`metadata.json`).
- **Admin password** via env: `ADMIN_PASSWORD` (also used for trash/permanent-delete confirmation).
- **Simulator mode** — controlled by `event_details.simulators_enabled`. Secret admin menu via 5-tap logo.
- **Deploy** — Netlify (CLAUDE.md has details) or Railway (`.env.example` has all env vars).
