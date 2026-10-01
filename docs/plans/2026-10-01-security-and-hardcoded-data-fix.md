# Security, Hardcoded Data, & Dynamic Commission Implementation Plan

**Goal:** Eliminate all hardcoded secrets, fabricated prices, insecure authentication bypasses, and real PII from the codebase, and make vendor commission dynamic upon vendor setup.

**Architecture:** 
- Signed HMAC-SHA256 cookies for scanner terminals verified in middleware.
- Environment-driven secrets (`ADMIN_PASSWORD`, `SIMULATOR_PASSWORD`, `WAHA_API_KEY`, `TAB_SELF_PAY_SECRET`) with no insecure code fallbacks.
- Strict refusal on missing prices or invalid tiers instead of hardcoded 500 KES defaults.
- Dynamic vendor commission rates configured at vendor creation and displayed per-vendor across settlements.
- Removal of tracked leaked scripts, backups, screenshots, and debug tools.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind v4, Neon Postgres (`pg`).

---

### Task 1: Repository Hygiene & Untracking Sensitive Files
**Files:**
- Untrack: `scripts/**`, `backups/**`, `*.png`, `audit-shots/**`, `scan-qr.html`, `test-checkout-cli.js`, `check.js`, `fix.js`
- Modify: `.gitignore`, `AGENTS.md`
**Actions:**
1. Run `git rm --cached -r scripts/ backups/ *.png audit-shots/ scan-qr.html check.js fix.js test-checkout-cli.js`
2. Update `.gitignore` to explicitly ignore `backups/`, `scan-qr.html`, `test-checkout-cli.js`, `check.js`, `fix.js`, `audit-shots/`, and `*.png`
3. Update `AGENTS.md` to correct the statement that `scripts/` was untracked.

---

### Task 2: Dynamic Vendor Commission Setup
**Files:**
- Modify: `app/admin/vendors/page.tsx`
- Modify: `app/api/admin/vendors/route.ts`
- Modify: `app/admin/settlements/page.tsx`
- Modify: `components/admin/VendorDetailDrawer.tsx`
**Actions:**
1. In `app/admin/vendors/page.tsx`:
   - Add a `commission_rate` input to the "New Vendor" modal (default value "10").
   - In `handleCreate`, send `commission_rate: parseFloat(formData.commission_rate) || 10`.
2. In `app/api/admin/vendors/route.ts`:
   - Ensure `POST` handles `commission_rate` (or `commissionRate`), default to `10.0`, and creates or assigns the vendor with this agreed commission rate.
3. In `app/admin/settlements/page.tsx`:
   - Replace static table header `10% Comm & Net` with dynamic `Comm & Net` (or showing the rate per row).
   - Update explanatory cards to explain that commission is based on each stall's agreed rate (default 10%) rather than a mandatory flat 10%.
4. In `components/admin/VendorDetailDrawer.tsx`:
   - Ensure the commission rate field correctly persists and reflects updates to `vendor_event_assignments`.

---

### Task 3: Scanner Authentication Hardening & Gate Harmonization
**Files:**
- Modify: `middleware.ts`
- Modify: `app/api/scanner/auth/route.ts`
- Modify: `app/api/admin/gate-scanner/route.ts`
- Modify: `app/scanner/page.tsx`
**Actions:**
1. In `app/api/scanner/auth/route.ts`:
   - Sign the scanner session cookie using HMAC-SHA256 (`payload.signature`).
   - Remove fallback PIN `"2026"`; fail if neither DB PIN nor `GATE_SCANNER_PIN` is configured.
   - Replace hardcoded `masterAdminPass = "GoodlifeAdmin2026!"` with `process.env.ADMIN_PASSWORD`.
2. In `middleware.ts`:
   - Parse and verify the HMAC-SHA256 signature of `goodlife_scanner_session`. Reject if signature is invalid or cookie is malformed (preventing `goodlife_scanner_session=x` bypass).
3. In `app/api/admin/gate-scanner/route.ts`:
   - Remove hardcoded default `"2026"` pin fallback.
4. Align gate vocabulary in `app/scanner/page.tsx:1080` to match `app/scanner/login/page.tsx` ("VIP Fast-Track").

---

### Task 4: Eliminate Fabricated Prices & Ticket Fallbacks ("Never Invent Prices")
**Files:**
- Modify: `app/CheckoutClientPage.tsx`
- Modify: `app/api/payments/till-submit/route.ts`
- Modify: `app/api/paystack/verify/route.ts`
- Modify: `app/admin/dashboard/page.tsx`
- Modify: `lib/payhero-fulfill.ts`
**Actions:**
1. In `app/CheckoutClientPage.tsx:550`:
   - Change `const price = selectedTierObj?.price ?? 500;` to `selectedTierObj?.price ?? 0;`.
   - Prevent submission if `selectedTierObj` or `selectedTierObj.price` is invalid.
2. In `app/api/payments/till-submit/route.ts:63-74`:
   - Remove `let tierPrice = 500; let tierName = "Standard";`.
   - If tier lookup fails, return `400 Bad Request` with `{ error: "Ticket tier not found or invalid" }`.
3. In `app/api/paystack/verify/route.ts:65`:
   - Remove fallback `"ADV 500"`. Require `ticket_type` from pending record or metadata; fail if missing.
4. In `app/admin/dashboard/page.tsx:1313-1314`:
   - Remove fallback `"ADV 500"` and `500` in ticket creation form; require admin to select a tier.
5. In `lib/payhero-fulfill.ts:66`:
   - Do not default `eventId` to `1`. Throw / refuse fulfillment if event cannot be determined.

---

### Task 5: Move Admin & Simulator Passwords to Environment Variables
**Files:**
- Modify: `app/api/admin/login/route.ts`
- Modify: `app/api/admin/verify-simulator-password/route.ts`
- Modify: `app/admin/dashboard/page.tsx`
- Modify: `app/api/admin/trash/clear/route.ts`
- Modify: `README.md`, `CLAUDE.md`, `AGENTS.md`
**Actions:**
1. In `app/api/admin/login/route.ts`:
   - Check against `process.env.ADMIN_PASSWORD`.
2. In `app/api/admin/verify-simulator-password/route.ts`:
   - Check against `process.env.SIMULATOR_PASSWORD`.
3. In `app/admin/dashboard/page.tsx`:
   - Delete client-side check `if (trashPassword !== "GoodlifeAdmin2026!")`.
   - Change placeholder from `"Enter GoodlifeAdmin2026!"` to `"Enter admin password"`.
   - Send password to `/api/admin/trash/clear` in request body.
4. In `app/api/admin/trash/clear/route.ts`:
   - Verify confirmation password matches `process.env.ADMIN_PASSWORD`.
5. Remove cleartext passwords from `README.md`, `CLAUDE.md`, and `AGENTS.md`.

---

### Task 6: Remove Cleartext Credential Fallbacks & Sanitize PII
**Files:**
- Modify: `lib/waha.ts`
- Modify: `lib/whatsapp.ts`
- Modify: `lib/self-pay-token.ts`
- Modify: `components/admin/VendorDetailDrawer.tsx`
- Modify: `app/admin/whatsapp/page.tsx`
- Modify: `app/api/admin/whatsapp/test/route.ts`
- Modify: `app/vendor/sell/page.tsx`
- Modify: `lib/supabase-db.ts`
- Modify: `components/admin/CreateEventModal.tsx`
**Actions:**
1. In `lib/waha.ts:87` and `lib/whatsapp.ts:16`:
   - Remove `"goodlife_waha_secret_2026"` fallback. Fail cleanly if no API key is provided.
2. In `lib/self-pay-token.ts`:
   - Remove `process.env.DATABASE_URL` fallback. Require `TAB_SELF_PAY_SECRET || PAYHERO_CALLBACK_TOKEN`.
   - Align `isSelfPayTokenConfigured()`.
3. Sanitize real phone numbers:
   - In `lib/whatsapp.ts:242`: remove hardcoded `+254 799 560 898`, read from `ed.payment_contact || process.env.PAYMENT_CONTACT_PHONE || ""`.
   - In `VendorDetailDrawer.tsx:2008`: change `placeholder="e.g. 0799560898"` to `"e.g. 0712345678"`.
   - In `app/admin/whatsapp/page.tsx:489` and `app/api/admin/whatsapp/test/route.ts:37`: change `0712813284` to `"0712345678"`.
   - In `app/vendor/sell/page.tsx:1411`: replace `"e.g. DJ Pierra, MC Dave, Brian"` with `"e.g. Cashier 1, Bar Staff"`.
4. In `lib/supabase-db.ts:1252, 1274`:
   - Remove hardcoded till `"5761205"` in fallback and delete `localStorage.setItem("goodlife_event_details")`.
5. In `components/admin/CreateEventModal.tsx`:
   - Initialize till number, title, and venue to blank strings rather than hardcoding `"5761205"`, `"GOODLIFE 5"`, etc.

---

### Task 7: Secure Unprotected Endpoints & Scope Ticket PDF Downloads
**Files:**
- Modify: `app/api/hub/gallery/route.ts`
- Modify: `app/api/hub/radio/route.ts`
- Modify: `app/api/admin/tickets/route.ts`
- Modify: `app/api/admin/waitlist/route.ts`
- Modify: `app/api/admin/waitlist/broadcast/route.ts`
- Modify: `app/api/admin/notify-operators/route.ts`
- Modify: `app/api/tickets/[id]/download/route.ts`
**Actions:**
1. Add `requireAdmin(req)` to `POST` in `app/api/hub/gallery/route.ts` and `app/api/hub/radio/route.ts`.
2. Add `requireAdmin()` check inside `app/api/admin/tickets/route.ts`, `app/api/admin/waitlist/route.ts`, `app/api/admin/waitlist/broadcast/route.ts`, and `app/api/admin/notify-operators/route.ts`.
3. In `app/api/tickets/[id]/download/route.ts`:
   - Resolve the ticket's actual event (`getEventById(ticket.event_id)`) rather than singleton `fetchEventDetails()` (ID 1), so multi-event tickets render proper venue and branding.

---

### Task 8: Verification & Build Check
**Actions:**
1. Run `npx tsx tests/public-state.check.ts` (must pass 47/47 assertions).
2. Run `npx tsc --noEmit` (must report 0 TypeScript errors).
3. Run `npm run clean && npm run build` (must successfully complete production build).
