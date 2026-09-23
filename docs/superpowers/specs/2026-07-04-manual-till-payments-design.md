# Manual Till Payment Flow

> Date: 2026-07-04
> Status: Approved
> Related: Replaces Paystack M-Pesa STK Push with manual M-Pesa Till + admin approval

## Motivation

Disable the Paystack M-Pesa STK Push automated payment flow. Instead, customers pay manually to an M-Pesa Till number, submit proof of payment via a form, and an admin approves and issues tickets via the dashboard. WhatsApp remains the ticket delivery channel.

## Checkout Page

The checkout page retains its current structure but replaces the Paystack payment section:

- **Paystack removed**: No calls to `/api/paystack/initialize`, no polling `/api/paystack/verify`, no STK Push to the customer's phone.
- **Till Number displayed prominently**: A large card at the top of the payment section shows the Till Number (from `event_details.till_number`, default `5761205`) with clear step-by-step instructions ("1. Send to Till, 2. Enter reference below, 3. Submit").
- **Payment Contact fallback**: The existing WhatsApp contact number is shown beneath the form for customers who prefer to forward their M-Pesa confirmation manually.
- **Form fields kept**: Ticket tier selection, name, phone, quantity remain.
- **New field**: M-Pesa reference / transaction ID (text input, required).
- **Submit action**: `POST /api/payments/till-submit` creates a `pending_payments` record with `status = 'till_pending'`.

### API: `POST /api/payments/till-submit`

Creates a pending payment request:

```
Body: { ticket_type, quantity, buyer_name, phone_number, mpesa_reference, whatsapp_number? }
Response: { success: true, pending_id }
```

Inserts into `pending_payments` with:
- `checkout_request_id`: auto-generated (e.g. `TILL-{random8}`)
- `status`: `'till_pending'`
- `mpesa_reference`: user-provided
- `ticket_type`, `quantity`, `buyer_name`, `phone_number`: from form

## Admin Dashboard

### New Tab: "Payment Requests"

A new tab in the admin dashboard showing all records where `status = 'till_pending'`:

| Column | Source |
|--------|--------|
| Name | `buyer_name` |
| Phone | `phone_number` |
| Tier | `ticket_type` |
| Qty | `quantity` |
| M-Pesa Ref | `mpesa_reference` |
| Submitted | `created_at` |
| Actions | Approve / Reject |

**Approve** (`POST /api/admin/pending-payments/approve`):
- Reads the `pending_payments` record
- Creates ticket(s) using the same logic as the existing Paystack callback (`createTicket` in `lib/supabase-db.ts`)
- Sets ticket `mpesa_receipt` to the user-provided M-Pesa reference
- Updates `pending_payments.status` → `'approved'`
- Does NOT auto-send WhatsApp (admin sends manually from ticket ledger)

**Reject** (`POST /api/admin/pending-payments/reject`):
- Updates `pending_payments.status` → `'rejected'`
- No tickets created

The existing "Pending Payments" resolution endpoint can be reused or extended.

## Ticket Ledger

No changes. The existing ledger already shows all tickets and has the "Resend WhatsApp" button, which covers the semi-auto delivery model (admin approves → creates ticket → admin optionally clicks "Resend WhatsApp").

## Database

Add `mpesa_reference` column to `pending_payments` table:

```sql
ALTER TABLE pending_payments ADD COLUMN mpesa_reference TEXT;
```

This stores the M-Pesa transaction ID the customer submits in the "I've Paid" form.

## Files Changed

| File | Change |
|------|--------|
| `schema-neon.sql` | Add `mpesa_reference` to `pending_payments` table definition |
| `app/page.tsx` | Remove Paystack checkout flow. Display Till card + instructions + "I've Paid" form. Keep tier selection and user fields. |
| `app/api/payments/till-submit/route.ts` | **New** — handles till payment submission |
| `app/api/payments/till-submit/` | New directory + route.ts |
| `app/admin/dashboard/page.tsx` | Add "Payment Requests" tab with approve/reject buttons |
| `app/api/admin/pending-payments/approve/route.ts` | **New** — approve endpoint that creates tickets |
| `app/api/admin/pending-payments/reject/route.ts` | **New** — reject endpoint |
| `lib/supabase-db.ts` | Minor: ensure `pending_payments` insert/update handles `till_pending` and `mpesa_reference` |
| `.env.local` / Vercel env | Remove `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` (optional — can keep unused) |

## What Stays Unchanged

- Ticket PDF generation (`lib/ticket-generator.ts`)
- WhatsApp sending (`lib/whatsapp.ts`)
- Scanner (`app/admin/scanner/page.tsx`)
- Admin auth
- Operator notifications
- Ticket editing / deletion / trash
- CSV export

## Future Considerations (not in scope)

- Email delivery of tickets
- Auto-send WhatsApp on approval
- Webhook-based till confirmation (if M-Pesa Till API becomes available)
