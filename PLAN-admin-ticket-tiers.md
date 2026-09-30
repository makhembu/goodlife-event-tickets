# GOODLIFE admin — findings & implementation plan

Everything below is verified by reading the source and by read-only queries
against the live database. No production data was written.

---

## 1. WhatsApp gateway — FIXED, COMMIT `5844b37`

**The page was not warming up. It was reporting a crash as a boot.**

Live gateway said:

```
GET /api/sessions/default  ->  200 {"status":"FAILED"}
GET /api/default/auth/qr   ->  422 "Session status is not as expected.
                                     Try again later or restart the session"
GET /api/server/version    ->  200 2026.8.1  WEBJS  CORE
```

The engine was up the whole time. `getWahaSession()` had no `FAILED` case, so
it fell through to the catch-all `{status:"STARTING", warming:true}`. The page
then said *"warming up, please wait 15–30 seconds"* and polled every 5s —
forever — for a session that was never going to finish booting. Recovery
required an SSH session.

`warming` was being used to mean *"not a state I recognise"*, which is not the
same thing as *"transient, wait for it"*. Same shape as the routing bug:
one place deciding a state, a fallthrough quietly inventing the answer.

**Fixed:** `FAILED` is terminal and reports `failed: true`. New admin-gated
`POST /api/admin/whatsapp/restart`. The console shows the truth plus a
Restart button instead of the false reassurance.

**Session recovered.** `FAILED → STARTING → SCAN_QR_CODE` in ~20s. The pairing
code should be live on `/admin/whatsapp` now — go scan it before it expires.

**Open question — not fixed:** the session's webhook config points at
`http://192.168.100.29:5678/webhook/waha` — a LAN address on n8n's default
port, not this app's `/api/whatsapp/webhook`. If the gateway isn't on that
LAN, WAHA's event delivery has been failing silently. Needs your call on
which is intended.

---

## 2. "Why are those two camping tiers hardcoded?" — because a GET writes to your database

They exist in `DEFAULT_POSTER_TIERS` (`lib/supabase-db.ts:1698`), used three ways:

| Line | Use |
|---|---|
| `268` | `createEvent` fallback when no previous event has tiers |
| `1801` | **`fetchTicketTiers` INSERTs them** when an event has zero tiers |
| `1771`, `1837` | returned to the browser when the API call fails |

Line 1801 is the problem. `fetchTicketTiers` is a **read** function that
**inserts 8 rows** — and `app/page.tsx:117` calls it on every homepage render.
An event with zero tiers silently acquires a full price list, forever, without
an admin doing anything.

**Live proof — GOODLIFE 4 (event #2) is selling at exactly those prices:**

```
#2 GOODLIFE 4  [flagship/active]      8 tiers, 5 camping
       450  entry   Early Bird Pass
       800  entry   ADVANCE PASS
      1000  entry   gate VIP Fast-Track Pass
      1200  camping 1PX BED IN SHARED 6PX TENT
      1500  camping PITCH YOUR OWN TENT
      2500  camping 2PX PRIVATE DOME TENT
      4000  camping 4PX PRIVATE GROUP TENT      <-- your question
      6000  camping 6PX PRIVATE GLAMPING TENT   <-- your question
      fingerprint match: 8/8 DEFAULT_POSTER_TIERS
```

Compare event #1, which has real human prices (`DIE HARD 400`,
`4PX TENT X SLEEPING BAG 2400`) and **0** fingerprint rows.

**Nobody chose those prices.** GOODLIFE 4 is live and sellable right now.

**Four consequences, in order of severity:**

1. **An unbuyable-looking tier list is being sold.** If those aren't your real
   prices, customers are being charged the wrong amount.
2. **"Zero tiers" is an unreachable state.** So the guard I shipped in
   `d4b29cc` — downgrade a tierless event to the coming-soon page instead of
   showing an invented ladder — **can never fire.** It's dead code. The
   data layer guarantees it.
3. **The ladder exists in three copies that have already drifted.**
   `DEFAULT_POSTER_TIERS` has `gate VIP Fast-Track Pass` (U+2011 non-breaking
   hyphen); `CheckoutClientPage.tsx:413` has `gate VIP Fast‑Track Pass` with a
   different hyphen. Same tier, two ids' worth of near-identity.
4. **`ticket_tiers` has no `created_at`.** You cannot tell a seeded row from a
   real one, and there's no stable ordering beyond `ORDER BY price ASC`.

**Verdict: this should be deleted, not tuned.** A new event should start with
zero tiers and look visibly incomplete in the admin — not silently stocked.

---

## 3. "Why does CREATE EVENT seed tiers? Is that right?"

`createEvent` clones the most recent other event's tiers
(`lib/supabase-db.ts:264-268`), falling back to `DEFAULT_POSTER_TIERS`.

**Cloning is right for a flagship rollover** — prices carry year to year,
that's the common case, and retyping 8 tiers annually is how mistakes happen.

**But the source event is chosen wrong.** The ordering is
`(COALESCE(category,'') = 'mini') ASC, created_at DESC, id DESC`.
That expression is a boolean: `false`(0) for flagship, `true`(1) for mini.
`ASC` therefore puts **flagship first, always**.

> **A brand-new mini festival clones the flagship's price list. Always.
> It never clones another mini.**

So "create a Sunday Park & Chill" silently gives you five camping tents. That
is very likely where the tiers you're seeing on the mini came from.

**And it's silent.** The admin gets no indication that 8 rows were copied.

**Verdict:** keep cloning, but (a) match the category, (b) tell the admin what
was copied and from where, (c) never fall back to `DEFAULT_POSTER_TIERS`.

---

## 4. Mobile judgment on the two modals

Scored against the iOS HIG framework you asked for. **4/10.**

| Check | Now | Why |
|---|---|---|
| Safe areas / all sizes | ✗ | content escapes the viewport, see below |
| Touch targets ≥ 44×44 | ✗ | close button is ~28×28 (`p-1` + `w-6 h-6`, line 3810) |
| Text scales | ✗ | every input is `text-xs`/`text-[11px]` → **iOS zooms the page on focus** |
| VoiceOver completable | ✗ | no `htmlFor`/`id` on any label |
| Native navigation idiom | ~ | 6 stacked tab rows |

### "Should we make it tablike?" — **No for the form, yes for the tab bar.**

**Keep the modal.** HIG: modals are for *focused tasks*. "Add one ticket tier"
is exactly that. Tabs are for 2–5 *primary destinations*. The pattern isn't
the problem; the execution is.

What is actually broken, at `page.tsx:3805-3941`:

```tsx
3807: max-w-lg w-full p-6 relative shadow-(--shadow-brut-xl)
//       ^ no max-h, no overflow-y-auto
```

The overlay is `fixed inset-0 flex items-center`, so **the form overflows above
and below the viewport with no way to reach it.** Two modals *in the same file*
already do this correctly (`3116`: `max-h-[90vh] flex flex-col`; `4307`:
`max-h-[92vh] overflow-y-auto`). The tier modal just missed the pattern.

Then, at 375px:
- `3821: grid grid-cols-2 gap-4` — unprefixed. After `p-4` + `p-6` padding that's
  **~139px per column**. The `datetime-local` pair inside gets **~120px**, which
  native date/time controls cannot render in.
- `3830/3841: text-xs` — below 16px, so **iOS Safari zooms the viewport the
  moment you tap the field.** You type at 2× and can't see the other fields.
- The close button is 28px. The HIG floor is 44px.

**The tab bar is the real idiom problem.** Six buttons, `flex-col sm:flex-row`
(line 1664), `flex-1 py-3` each. On mobile that's **six full-width rows ≈ 264px
of chrome before any content.** HIG caps primary destinations at 2–5 and treats
stacked top-tabs as a foreign pattern.

### The Create Event modal is the better-built one — don't copy it

Worth knowing before you rewrite: `components/admin/CreateEventModal.tsx`
(174–567, mounted from `components/EventSelector.tsx:300`) already does most
of this right — `max-w-2xl max-h-[92vh] flex flex-col` (175), a pinned header
(177) with a genuinely scrolling form (194), and `grid-cols-1 md:grid-cols-2/3`
on four field rows. **That is the pattern to copy into the dashboard modals.**

Its remaining faults:
- Close button is **24×24px** (`p-1` + `w-4 h-4`, line 187), icon-only, no
  accessible name. Against 44.
- Format toggle `grid-cols-2 gap-2` (206) has no breakpoint → ~155px each, with
  ~30-character monospace uppercase labels that wrap to three lines.
- Zero dialog semantics: no `role="dialog"`, `aria-modal`, Escape, focus trap,
  backdrop close, or scroll lock.
- `recurrenceTime` is `type="text"`, so `2pm`, `1400` and `2.00 PM` all pass
  straight through to the recurrence engine.
- `DAY OF WEEK` offers only Sun/Sat/Fri/Thu — no Mon/Tue/Wed, though
  `recurrence_day` is a free string.
- `handleCategorySwitch` doesn't reset `recurrenceTime`, so flagship → mini →
  flagship leaves the mini's start time in place.

**Recommendation:** mobile bottom sheet (`items-end sm:items-center`, scrollable
body, full-width), 44px targets, `text-base sm:text-xs` inputs, single column,
and turn the tab bar into a horizontally-scrollable strip.

---

## 5. Browser dialogs — 97 of them, zero custom

| File | alert | confirm | prompt | total |
|---|---|---|---|---|
| `app/admin/dashboard/page.tsx` | 22 | 16 | 1 | 39 |
| `components/admin/VendorDetailDrawer.tsx` | 21 | 3 | – | 24 |
| `app/vendor/sell/page.tsx` | 15 | – | – | 15 |
| `app/vendor/menu/page.tsx` | 9 | 1 | – | 10 |
| `app/admin/settlements/page.tsx` | 5 | – | – | 5 |
| `app/admin/vendors/page.tsx` | 2 | – | – | 2 |
| `app/admin/gallery/page.tsx` | 2 | – | – | 2 |
| `app/pay/tab/[id]/page.tsx` | 5 | – | – | 5 |

**Every one is a native `alert`/`confirm`/`prompt`.** There is no toast system,
no shared dialog, and `components/ui/` contains exactly one file
(`haptic-feedback.ts`). `class-variance-authority` is installed with zero
imports. No Radix, no Headless UI.

Why this matters beyond looking cheap:

- **`confirm()` is the only guard on `DELETE FROM payment_logs`** (line 612) and
  **`DELETE FROM pending_payments`** (622). Both queries are `DELETE FROM <table>`
  with **no `WHERE`** — they erase every event's rows, not the selected one. The
  only thing standing between an operator and total loss of the audit trail is a
  native dialog they may muscle through on a phone.
- `prompt("Enter developer password…")` (840) for enabling simulators.
- Success feedback is also `alert()` — e.g. `Tickets created: …` (697).
- Native dialogs are blocking, unbrandable, and can't show the event context.

Two idioms already coexist: native `confirm` *and* hand-rolled JSX modals for
the same actions (`deletingTierId`, `deletingTicketId`, `showTrashPasswordModal`).
So the replacement is half-written.

---

## 5b. Six more defects found while auditing (all verified in source)

### 🔴 An unauthenticated visitor can write to your database

`middleware.ts:78` exempts GET:

```ts
78: if (pathname.startsWith("/api/ticket-tiers") && request.method !== "GET") {
```

`GET` is exempt. But `fetchTicketTiers` **INSERTs 8 rows** (§2). So
`GET /api/ticket-tiers?eventId=2` with **no session at all** inserts a full
camping price list into event 2. Anyone who guesses an event id can do it, and
`app/page.tsx` runs it on every homepage view.

This is the reason Phase 1 must remove the write, not just the fabrication:
right now the read path *is* an unauthenticated write primitive.

### 🔴 Every mini festival is silently given flagship tent inventory

`CreateEventModal.tsx:76-77` — switching to the mini preset zeroes the inventory:

```ts
76:  setMaxTentInventory(0);
77:  setMaxSharedBeds(0);
```

It is sent in the payload. `lib/supabase-db.ts:237-238` then discards the zero:

```ts
237:  event.max_tent_inventory || 30,
238:  event.max_shared_beds || 12,
```

`0 || 30 === 30`. **Every mini created through that modal is stored with 30
tents and 12 shared beds** — exactly the numbers the preset tried to clear.
Use `??`, not `||`.

### 🔴 Bulk hide/edit hits other events

`updateTicketTier` runs `UPDATE ticket_tiers SET … WHERE id = $1` with **no
`event_id`** (`lib/supabase-db.ts:1938`), but the table's primary key is
`(id, event_id)`. So "Hide selected" on event 9's `early-bird-500` **also
hides it on events 2, 5 and 7** — which is exactly how the seeded tiers became
impossible to reason about. `RETURNING *` reports one row, so the UI says it
saved.

### 🟠 Tier sale windows are copied from a past event, verbatim

`createEvent` copies `available_from` / `available_until` (289-290) and
`max_quantity` (291) and `badge_text` (297) from the source event. Those are
**absolute timestamps from an event that already happened.** A tier with
`available_until = 2025-10-31` is *permanently invisible* on the new event —
not late-selling, invisible. And a tier that sold out 30/30 at the flagship
reads as fresh capacity at the new one, because `sold_count` is recomputed from
`tickets` and starts at 0. Scarcity silently resets; windows silently expire.

The source query also ignores `status` and `archived_at`, so an 18-month-old
concluded event is a perfectly valid donor.

### 🟠 Errors in Create Event are rendered off-screen

`CreateEventModal.tsx` — the error banner is the **first** child of the
scrolling form (line 195); the submit button is the **last** (line 555). Every
`setError` fires after the user presses submit, i.e. while they are scrolled to
the bottom. **The red banner renders ~600px above the viewport and the user
sees nothing happen.** No `scrollIntoView`, no `role="alert"`.

### 🟠 Create Event has no dialog semantics whatsoever

`CreateEventModal.tsx` has **no** `role="dialog"`, `aria-modal`, Escape
handler, focus trap, backdrop close, scroll lock, or `autoFocus`. It is
strictly less accessible than the dashboard's hand-rolled modals — which at
least have `role`/`aria-modal` and a partly-working Escape.

Also: its Escape… it has none. But the *metadata* modal's Escape **silently
breaks** — `onKeyDown` at `page.tsx:3115` is a React handler on a
**non-focusable `<div>`**, so it only fires while focus happens to be inside.
Click the backdrop once and Escape stops working for the rest of that modal's
life. `closeAllModals` is also over-broad: Escape closes 11 unrelated modals.

---

## 6. Your ticket-tiers complaints, confirmed

| Complaint | Verdict |
|---|---|
| "no way to select this is a camping ticket" | **Confirmed.** Zero occurrences of `tier_category`, `camping_type`, `admits_quantity`, `is_camping_bundle` or `badge_text` anywhere in `app/admin/dashboard/page.tsx`. |
| "this ticket is for this event" | **Confirmed.** `event_id` is never a form field. `handleCreateTierClick` (1104) never sets it, so `createTicketTier` falls back to `fetchActiveEvent()` → then hardcoded `1` (`lib/supabase-db.ts:1858-1862`). Create a tier while the selector says "All Events" and it lands on an arbitrary event. |
| "add tier button is not mobile friendly" | **Confirmed.** See §4. |
| "payments tab does not know which event it's from" | **Confirmed, and worse than described.** |

### The payments tab

- There is **no `activeTab === "payments"` branch in the render ternary.** The tab
  is rendered at `1727 / 2150 / 2424 / 2632 / 2701` and then falls through to the
  catch-all at `2830`. It works by accident of ordering.
- `SELECT * FROM payment_logs ORDER BY created_at DESC` — **no `WHERE`, no `LIMIT`**.
- `SELECT * FROM pending_payments ORDER BY created_at DESC` — same.
- `loadPaymentLogs` / `loadPendingPayments` take no `eventId`; `handleEventSelect`
  (394) reloads metrics, tiers and waitlist — **not payments**.
- `event_id` **is** in both tables and both queries are `SELECT *`, so it reaches
  the browser and is simply never rendered. The ledger table has an EVENT column
  (`1963`); payments has none.

So: the payments tab shows every event's money with no event label, the global
"ALL EVENTS" heading says nothing about which row belongs where, and two
"Clear All" buttons erase the lot behind one native `confirm()`.

### Also found in the tiers path

- `updateTicketTier` does `UPDATE ticket_tiers SET ... WHERE id = $1` — **not
  event-scoped**, but the table's uniqueness is `(id, event_id)`. A tier id
  present in two events is updated in **both**; `RETURNING *` shows one. You edit
  one and silently mutate another.
- `handleEditTierClick` PUTs the whole fetched tier back — including
  `sold_count`, which is a computed subquery alias, not a stored column.
- `createTicketTier` is an **upsert** on `(id, event_id)`: adding a tier whose id
  already exists silently overwrites it.
- The form label says "Tag / Badge Label" but writes `tag`. `badge_text` — the
  ribbon text customers actually see on checkout — is **not editable**. Two
  columns, one label.
- `available_from`/`available_until` use `new Date(...).toISOString()` (a UTC
  round-trip) directly contradicting the file's own `toDatetimeLocal` helper
  three hundred lines above, which exists because the columns are naive EAT strings.

---

# IMPLEMENTATION PLAN

Ordered by blast radius. Each phase ships and verifies independently.

### Phase 0 — Decide GOODLIFE 4's real prices (you, not me)

The seeded ladder is live. Before any code change, tell me the real prices for
event #2 and I'll write them. **I will not delete tier rows on my own** —
`tickets.ticket_type` references tier ids *and* names, and event #2 already has
sales. Deleting a row can orphan issued tickets and break the gate.

### Phase 1 — Stop the read-path write *(security fix, not just cleanliness)*

- [ ] `fetchTicketTiers`: delete the seeding block (1799-1833). Return `[]`.
- [ ] Delete both `DEFAULT_POSTER_TIERS` fallbacks (1771, 1837). Return `[]`.
- [ ] Delete `DEFAULT_POSTER_TIERS` (1698) and the duplicate ladder in
      `CheckoutClientPage.tsx:405-427`.
- [ ] Add `requireAdmin()` to `app/api/ticket-tiers/route.ts` and `[id]/route.ts`.
      Middleware is currently the *only* gate and it exempts GET — AGENTS.md
      says handlers must check regardless of matcher drift.

*Effect:* zero tiers becomes reachable, so the coming-soon guard in `d4b29cc`
starts working. Events with real tiers are unaffected. **This is the highest
value / lowest risk change in the plan.** It also closes the unauthenticated
write path, which is a live exposure, not a hypothetical.

### Phase 2 — Fix what gets copied, and to where

- [ ] `createEvent`: match category when choosing the source event
      (`(COALESCE(category,'')='mini') = (COALESCE($cat,'')='mini') DESC`).
- [ ] Exclude closed/archived source events.
- [ ] **Do not copy** `available_from`, `available_until`, `max_quantity`,
      `badge_text`, `show_only_on_event_day`, `hide_on_event_day`. These are
      absolute values from a past event and they silently expire or reset.
- [ ] `||` → `??` at `supabase-db.ts:237-238`, or a mini can never have zero
      inventory.
- [ ] Never fall back to a default ladder — empty is a valid start.
- [ ] Return the cloned tier list from `createEvent` and surface it in the
      modal: *"Copied 8 tiers from GOODLIFE 4 — review the camping ones."*

### Phase 3 — Ticket tier form: the fields you asked for

Both modals (`3805`, `3945`), one shared `<TierFields>` component so they can't drift.

- [ ] `tier_category` — segmented **Entry / Camping**, not a dropdown.
- [ ] `camping_type` — **None / Private tent / Shared bed**, shown only when camping.
- [ ] `admits_quantity` — number, gated on camping.
- [ ] `is_camping_bundle` — derived from `camping_type`, shown read-only.
- [ ] `badge_text` — its own field. Relabel the existing one to just "Tag".
- [ ] `event_id` — explicit `<select>` prefilled from the selector, with a
      warning when it differs, and **hard-blocked on "All Events"**.
- [ ] Server: column allowlist on POST and PUT; **event-scope the UPDATE**
      (`WHERE id = $1 AND event_id = $2` — currently a cross-event write);
      reject a client-supplied `sold_count`.
- [ ] Fix the EAT round-trip on `available_from`/`available_until`.

### Phase 4 — Mobile

- [ ] Modal shell → `max-h-[92vh] flex flex-col`, body `overflow-y-auto`.
      Mobile: `items-end sm:items-center`, sheet corners.
- [ ] Every close button → `min-w-[44px] min-h-[44px]`.
- [ ] Inputs → `text-base sm:text-xs` (stops iOS zoom-on-focus).
- [ ] Grids → `grid-cols-1 sm:grid-cols-2`.
- [ ] `htmlFor`/`id` on every label; `autoFocus` the first field.
- [ ] Tab bar → horizontally scrollable strip on mobile.
- [ ] Section header `flex-wrap`.

### Phase 5 — Payments event context

- [ ] `?eventId=` on `/api/admin/payment-logs` and `/api/admin/pending-payments`;
      `WHERE event_id = $1` server-side.
- [ ] Add the EVENT column (mirror the ledger's `eventLabels` lookup at 1963).
- [ ] `handleEventSelect` reloads payments; add them to the 30s poll.
- [ ] **Scope the destructive buttons.** "Clear All" must require a specific
      event and name it: *"Delete all 412 payment log rows for GOODLIFE XP."*
- [ ] Add the missing `activeTab === "payments"` branch before the catch-all.
- [ ] Add `LIMIT` to both unfiltered selects.

### Phase 6 — Dialogs

- [ ] `components/ui/Dialog.tsx` — focus trap, Escape (on `document`, not on a
      non-focusable overlay div — that is why the current Escape silently dies),
      scroll lock, `aria-modal`, labelled title. Portal to `body`.
- [ ] `components/ui/ConfirmDialog.tsx` — `danger` variant, requires typing the
      event name for the two unscoped deletes.
- [ ] `components/ui/Toaster.tsx` + provider — replaces `alert()` for all
      success feedback, and is where a form error belongs (rather than a banner
      pinned above a scrolled-to-bottom submit button).
- [ ] Migrate in waves: dashboard (39) → vendor drawer (24) → vendor POS (25) →
      the rest (9). Swap the hand-rolled confirm modals first, since they prove
      the design.
- [ ] Add the missing `role`/`aria-modal`/Escape to `CreateEventModal`.
- [ ] `htmlFor`/`id` on all ~42 labels across the two event modals.
- [ ] Update `AGENTS.md` to ban `alert`/`confirm`/`prompt` in `app/`+`components/`.

### Phase 7 — Tests

`tests/` is tracked and already has the routing check. Add:
- `tests/tier-seeding.check.ts` — asserts `fetchTicketTiers` never inserts
  (a read-only run against a scratch event with zero tiers).
- `tests/payments-scope.check.ts` — asserts the payments API filters.

---

## Also worth a decision

`recurrence_pattern: 'monthly'` is in the TypeScript union
(`lib/supabase-db-types.ts:19`) but **no UI can set it** and the engine logs
`"not supported yet"` and degrades to non-recurring — so a monthly series would
die after its first date. Dead enum member today. Either implement it or delete
it from the union so nobody types it into a script.

---

## One thing I did not do

`scripts/repair-event-status.js` normalises the two bad production rows
(`status='active'` → `live`, and the stray `archived_at` on GOODLIFE XP). It is
dry-run by default and **still unapplied** — it's a production write, and the
`canonicalStatus` fold in `d4b29cc` already unblocks the sales side, so there's
no urgency. Say the word and I'll run it with `--apply`.
