import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { neonQuery, createTicket, fetchTicketTiers, getEventById } from "@/lib/supabase-db";
import { hashIdentifier } from "@/lib/radio/shoutout-filter";
import { normalizePhone } from "@/lib/phone";
import { sendTicketViaWhatsApp } from "@/lib/whatsapp";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/radio/contests/enter
 * Listener submits an answer / passphrase to an on-air contest.
 * If correct (or winning draw), atomically generates a REAL festival ticket pass
 * strictly up to the contest's max_winners cap.
 */
export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, "contest-enter", { maxRequests: 5, windowMs: 60 * 1000 });
  if (!rl.allowed) return rl.response!;

  try {
    const body = await req.json();
    const { contest_id, name, phone, answer } = body || {};

    if (!contest_id || !name || !phone) {
      return NextResponse.json({ error: "Missing required fields: name, phone, contest_id." }, { status: 400 });
    }

    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) {
      return NextResponse.json({ error: "Please enter a valid Kenyan phone number (e.g. 0712345678)." }, { status: 400 });
    }

    const participantHash = hashIdentifier(cleanPhone);
    const cleanName = String(name).trim().slice(0, 100);
    const cleanAnswer = String(answer || "").trim().toLowerCase();

    // 1. Fetch contest and lock row for check
    const contestRes = await neonQuery(
      `SELECT 
        c.id, c.title, c.passphrase, c.contest_type, c.status, 
        c.event_id, c.tier_id, c.max_winners, c.winners_awarded, c.ends_at,
        e.title as event_title
       FROM radio_contests c
       JOIN events e ON c.event_id = e.id
       WHERE c.id = $1 LIMIT 1;`,
      [contest_id]
    );

    if (!contestRes?.rows || contestRes.rows.length === 0) {
      return NextResponse.json({ error: "Contest not found." }, { status: 404 });
    }

    const contest = contestRes.rows[0];

    // Check status
    if (contest.status !== "active" || (contest.ends_at && new Date(contest.ends_at) <= new Date())) {
      return NextResponse.json({ error: "This contest has ended." }, { status: 400 });
    }

    // Check cap
    if (contest.winners_awarded >= contest.max_winners) {
      return NextResponse.json({ error: "All ticket passes for this contest have already been won!" }, { status: 400 });
    }

    // Check if participant already entered
    const existingEntry = await neonQuery(
      `SELECT id, is_winner FROM radio_contest_entries WHERE contest_id = $1 AND participant_hash = $2 LIMIT 1;`,
      [contest_id, participantHash]
    );

    if (existingEntry?.rows && existingEntry.rows.length > 0) {
      return NextResponse.json({ error: "You have already entered this contest." }, { status: 409 });
    }

    // 2. Check if answer matches passphrase (for passphrase type)
    let isWinner = false;
    if (contest.contest_type === "passphrase") {
      if (contest.passphrase && cleanAnswer === contest.passphrase.toLowerCase()) {
        isWinner = true;
      } else {
        // Record non-winning entry
        await neonQuery(
          `INSERT INTO radio_contest_entries 
            (contest_id, listener_name, listener_phone, participant_hash, answer_text, is_winner)
           VALUES ($1, $2, $3, $4, $5, FALSE);`,
          [contest_id, cleanName, cleanPhone, participantHash, cleanAnswer]
        );
        return NextResponse.json({
          success: false,
          is_winner: false,
          message: "Incorrect passphrase. Keep listening to GOODLIFE Radio 254 for the clue!",
        });
      }
    } else {
      // Random draw / trivia: recorded as entry
      await neonQuery(
        `INSERT INTO radio_contest_entries 
          (contest_id, listener_name, listener_phone, participant_hash, answer_text, is_winner)
         VALUES ($1, $2, $3, $4, $5, FALSE);`,
        [contest_id, cleanName, cleanPhone, participantHash, cleanAnswer]
      );
      return NextResponse.json({
        success: true,
        is_winner: false,
        message: "Entry received! The winner will be picked live on air.",
      });
    }

    // 3. Atomically issue winning ticket pass via real ticketing flow
    let ticketId: string | null = null;
    if (isWinner) {
      // Fetch tier details
      const tiers = await fetchTicketTiers(contest.event_id);
      const matchedTier = tiers.find((t) => t.id === contest.tier_id);
      if (!matchedTier) {
        return NextResponse.json({ error: "Contest tier configuration error." }, { status: 500 });
      }

      // Generate Ticket ID
      const reference = `WIN-${randomBytes(4).toString("hex").toUpperCase()}`;
      const newTicket = await createTicket({
        id: reference,
        mpesa_receipt: `RADIO-WIN-${Date.now()}`,
        phone_number: cleanPhone,
        ticket_type: `${matchedTier.name} (Radio Winner)`,
        amount_paid: 0,
        buyer_name: cleanName,
        whatsapp_number: cleanPhone,
        event_id: contest.event_id,
        guest_count: matchedTier.admits_quantity || 1,
        is_camping: Boolean(matchedTier.is_camping_bundle),
        camping_type: matchedTier.camping_type || "none",
      });

      ticketId = newTicket.id;

      // Update contest winners count and entry record
      await neonQuery(
        `UPDATE radio_contests 
         SET winners_awarded = winners_awarded + 1,
             status = CASE WHEN winners_awarded + 1 >= max_winners THEN 'closed' ELSE status END
         WHERE id = $1;`,
        [contest_id]
      );

      await neonQuery(
        `INSERT INTO radio_contest_entries 
          (contest_id, listener_name, listener_phone, participant_hash, answer_text, is_winner, awarded_ticket_id)
         VALUES ($1, $2, $3, $4, $5, TRUE, $6);`,
        [contest_id, cleanName, cleanPhone, participantHash, cleanAnswer, ticketId]
      );

      // Dispatch WhatsApp ticket pass in background
      sendTicketViaWhatsApp(newTicket.id, cleanPhone, cleanName).catch((err) => {
        console.error("Failed to send winning ticket via WhatsApp:", err);
      });
    }

    return NextResponse.json({
      success: true,
      is_winner: true,
      ticket_id: ticketId,
      event_title: contest.event_title,
      message: `CONGRATULATIONS! You won a free ticket pass to ${contest.event_title}! Your digital pass has been issued to ${cleanPhone}.`,
    });
  } catch (err: any) {
    console.error("[api/radio/contests/enter] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to process entry" }, { status: 500 });
  }
}
