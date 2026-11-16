# Product

## Register

product

## Users

Five groups, two products:

- **Attendees** — event-goers buying tickets on their phones via M-Pesa STK Push. Often on the move, on low bandwidth, in a hurry. They need the real next date, the real price, and a checkout that does not dead-end. Emotional state: anticipation.
- **Gate & box-office staff** — verifying tickets at the entrance under time pressure, sometimes in direct sunlight. They need one decisive admit/reject and a scanner that works with gloves and a bad connection.
- **Vendors & operators** — running POS sales, split payments, and customer tabs at the event. They need fast item entry, a clear balance due, and a tab they can close without guessing.
- **Radio listeners** — tuning into GOODLIFE Radio 254 on the public player, often on mobile. They need the stream to keep playing, the current show to be obvious, and shoutouts/tips to work without an account.
- **Presenters & station managers** — running shows, schedules, playlists, drops, and the broadcast console. They need dense, legible controls and a playout state they can trust.

## Product Purpose

Two products under one brand:

- **Ticketing** — premium mobile-first ticket browsing, M-Pesa checkout, PDF/WhatsApp delivery, QR gate scanning, vendor POS, customer tabs, event budgets, and settlements.
- **GOODLIFE Radio 254** — a 24/7 station: public player, schedule, shows, presenters, playlists, drops, shoutouts, tips, and the admin/presenter console.

Success means attendees get through the gate fast, organizers see an accurate ledger, vendors close the right tab, listeners never lose the stream, and presenters can run a show without fighting the console.

## Brand Personality

Bold, premium, confident. Energetic and modern because it is an event, refined because it is GOODLIFE. The voice is direct and uppercase, with no hedging and no soft CTAs.

The ticketing surface is a **printed festival pass and gate terminal**: cream paper, charcoal ink, sand-gold accents, thick borders, hard shadows. The radio surface is a **broadcast deck** inside the same frame: the same tokens, a dark player panel, a large circular play control, and mono metadata. Softer shapes are allowed on radio only if they are deliberate and documented; they are not a license to reintroduce the old navy/orange palette.

## Anti-references

- **Generic SaaS/corporate** — no cream-and-blue shadcn defaults, soft rounded cards, flat dashboards, or skeleton-loader minimalism. This is not a B2B SaaS.
- **Dark/neon/cyberpunk** — no all-dark theme with electric accents. The radio deck is a dark panel on a cream page, not a nightclub skin.
- **Minimalist/artsy** — no thin type, excessive whitespace, or understated elegance for its own sake. Operational screens should feel substantial and information-dense.
- **Two products in one template** — do not make radio look like checkout with a play button, and do not make checkout look like an admin dashboard.

## Design Principles

1. **Truth before the CTA** — show the real next session, the real price, and whether a pass actually exists before asking for money. Never render “KES 0 (FREE)” or a free-RSVP CTA when the ladder is empty.
2. **Confidence, not caution** — every button, badge, and label commits. No ghost buttons, no half-open states. The UI is decisive because the gate is decisive.
3. **Heavy is the point** — thick borders, hard block shadows, bold uppercase display type. Nothing floats; nothing feels ephemeral.
4. **Event energy, not corporate utility** — the design carries the excitement of a real gathering through color, weight, and rhythm.
5. **Thumbs and sunlight** — buying and scanning happen on phones, outdoors, under pressure. Primary controls are ≥44px, contrast is high, decisions are binary.
6. **Never interrupt the broadcast** — a service-worker update, payment poll, or reconnect must not reload the page while audio is playing or a payment is in flight.

## Accessibility & Inclusion

Target **WCAG 2.2 AA** on public and operational surfaces: 4.5:1 body text, 3:1 large text and UI boundaries, 24px minimum target size (44px for primary controls), visible focus, one `h1` and one `<main>` per page, associated labels, keyboard-operable cards/lightboxes, reduced-motion support, and no color-only status. Captions or transcripts are required wherever radio audio carries information the UI also needs to convey.
