# GOODLIFE Event Tickets

Premium mobile-first event ticketing platform for the GOODLIFE experience. M-Pesa STK Push checkout, PDF ticket generation, WhatsApp delivery, and QR gate scanning.

## Features

- **M-Pesa checkout** via Paystack STK Push — users buy tickets on their phone
- **PDF tickets** — generated on-the-fly with QR codes, branded with the GOODLIFE brutalist design system
- **WhatsApp delivery** — tickets sent automatically after payment (supports Whapi, OpenWA, Waha, Evolution gateways)
- **QR gate scanner** — camera-based + manual ticket lookup, audio/haptic feedback
- **Admin dashboard** — live sales metrics, ticket CRUD, trash/restore, CSV export, Paystack reconciliation
- **Ticket tier management** — advance vs gate-day pricing, hide/show tiers dynamically
- **Operator notifications** — WhatsApp alerts to staff on every sale
- **Orphaned payment reconciliation** — resolve failed M-Pesa payments manually

## Tech Stack

- **Framework**: Next.js 15 App Router + TypeScript
- **Styling**: Tailwind CSS v4 + custom brutalist design tokens
- **Database**: Neon PostgreSQL (server) + Supabase (client RLS)
- **PDF**: pdf-lib + QRCode + Bebas Neue display font
- **Animation**: motion (framer-motion)
- **Payment**: Paystack M-Pesa STK Push
- **Scanner**: html5-qrcode
- **Deploy**: Netlify (static) + Railway (optional)

## Getting Started

```sh
npm install
cp .env.example .env.local   # fill in your keys
npm run dev                   # localhost:3000
```

### Required env vars

See `.env.example`. Key ones:
- `DATABASE_URL` — Neon PostgreSQL connection string
- `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` — Paystack API keys
- `WHATSAPP_GATEWAY_URL` / `WHATSAPP_API_KEY` — WhatsApp delivery gateway
- `APP_URL` — public URL for ticket download links
- `GEMINI_API_KEY` — for AI Studio integration (optional)

### Admin access

```
Email:    admin@goodlife.com
Password: <set in env: ADMIN_PASSWORD>
```

Login at `/login`.

## Design System

Brutalist gate-terminal aesthetic. Hard block shadows, 4px borders, uppercase-heavy type, binary green/red feedback. See [DESIGN.md](DESIGN.md) for full token reference.

## Project Structure

```
app/
  page.tsx              # Checkout — tier picker, M-Pesa pay, ticket vault
  login/page.tsx        # Admin login
  admin/
    dashboard/page.tsx  # Sales metrics, ticket CRUD, tiers, trash, Paystack
    scanner/page.tsx    # QR gate scanner + manual lookup
  api/                  # Route handlers (admin, paystack, mpesa, whatsapp, tickets)
lib/
  supabase-db.ts        # Isomorphic DB layer (Neon server + localStorage client)
  neon-client.ts        # pg.Pool singleton
  ticket-generator.ts   # PDF ticket generation
  whatsapp.ts           # WhatsApp delivery + operator alerts
components/             # Shared UI components
schema.sql              # Supabase schema
schema-neon.sql         # Neon schema
```

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Production build (standalone output) |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |

## License

Private — GOODLIFE event management.
