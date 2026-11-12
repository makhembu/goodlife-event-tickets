/**
 * Phase 5 Ops, Money & Hardening Database Layer for GOODLIFE Radio.
 * Handles:
 * - Listener Tips (PayHero M-Pesa STK push & callbacks)
 * - Sponsors & Promotions
 * - Radio Audit Logs
 * - Staff linking
 */

import { neonQuery } from "@/lib/supabase-db";

export interface RadioTip {
  id: number;
  reference: string;
  amount: number;
  phone: string;
  phone_hash?: string;
  sender_name: string;
  message?: string | null;
  slot_id?: number | null;
  presenter_id?: number | null;
  status: "pending" | "completed" | "failed" | "reversed";
  payhero_reference?: string | null;
  mpesa_receipt?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface RadioSponsor {
  id: number;
  name: string;
  logo_url?: string | null;
  link_url?: string | null;
  tagline?: string | null;
  show_id?: number | null;
  slot_id?: number | null;
  is_active: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at: string;
}

export interface RadioAuditLog {
  id: number;
  admin_actor: string;
  role: string;
  action: string;
  target_type: string;
  target_id?: string | null;
  details?: any;
  created_at: string;
}

/** Mask phone number e.g. 0712345678 -> 0712***678 */
export function maskPhone(phone: string): string {
  if (!phone) return "";
  const clean = phone.replace(/\D/g, "");
  if (clean.length < 7) return "***";
  const start = clean.slice(0, 4);
  const end = clean.slice(-3);
  return `${start}***${end}`;
}

// -------------------------------------------------------------
// Radio Tips
// -------------------------------------------------------------

export async function createRadioTip(params: {
  reference: string;
  amount: number;
  phone: string;
  phone_hash?: string;
  sender_name: string;
  message?: string | null;
  slot_id?: number | null;
  presenter_id?: number | null;
}): Promise<RadioTip> {
  const { rows } = await neonQuery(
    `INSERT INTO radio_tips 
     (reference, amount, phone, phone_hash, sender_name, message, slot_id, presenter_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
     RETURNING *`,
    [
      params.reference,
      params.amount,
      params.phone,
      params.phone_hash || null,
      params.sender_name || "Anonymous",
      params.message || null,
      params.slot_id || null,
      params.presenter_id || null,
    ]
  );
  return rows[0];
}

export async function getRadioTipByReference(reference: string): Promise<RadioTip | null> {
  const { rows } = await neonQuery(
    `SELECT * FROM radio_tips WHERE reference = $1 LIMIT 1`,
    [reference]
  );
  return rows[0] || null;
}

export async function fulfillRadioTip(params: {
  reference: string;
  payheroReference?: string;
  mpesaReceipt?: string;
  amountPaid?: number;
}): Promise<{ success: boolean; alreadyCompleted?: boolean; tip?: RadioTip; error?: string }> {
  const existing = await getRadioTipByReference(params.reference);
  if (!existing) {
    return { success: false, error: "Tip not found" };
  }

  if (existing.status === "completed") {
    return { success: true, alreadyCompleted: true, tip: existing };
  }

  // Exact amount verification if provided
  if (params.amountPaid != null && Math.round(Number(existing.amount)) !== Math.round(params.amountPaid)) {
    return {
      success: false,
      error: `Amount mismatch: expected ${existing.amount}, received ${params.amountPaid}`,
    };
  }

  const { rows } = await neonQuery(
    `UPDATE radio_tips 
     SET status = 'completed',
         payhero_reference = COALESCE($2, payhero_reference),
         mpesa_receipt = COALESCE($3, mpesa_receipt),
         completed_at = CURRENT_TIMESTAMP
     WHERE reference = $1 AND status != 'completed'
     RETURNING *`,
    [params.reference, params.payheroReference || null, params.mpesaReceipt || null]
  );

  return { success: true, tip: rows[0] || existing };
}

export async function markRadioTipFailed(reference: string, reason?: string): Promise<boolean> {
  const { rowCount } = await neonQuery(
    `UPDATE radio_tips 
     SET status = 'failed'
     WHERE reference = $1 AND status = 'pending'`,
    [reference]
  );
  return (rowCount ?? 0) > 0;
}

export async function getRadioTipsOverview(filters?: {
  presenterId?: number;
  slotId?: number;
  status?: string;
  limit?: number;
}): Promise<{
  tips: Array<RadioTip & { presenter_name?: string; show_title?: string }>;
  totalAmount: number;
  completedCount: number;
  pendingCount: number;
  failedCount: number;
}> {
  let whereClauses: string[] = [];
  let params: any[] = [];
  let pIdx = 1;

  if (filters?.presenterId) {
    whereClauses.push(`t.presenter_id = $${pIdx++}`);
    params.push(filters.presenterId);
  }
  if (filters?.slotId) {
    whereClauses.push(`t.slot_id = $${pIdx++}`);
    params.push(filters.slotId);
  }
  if (filters?.status) {
    whereClauses.push(`t.status = $${pIdx++}`);
    params.push(filters.status);
  }

  const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const limitClause = filters?.limit ? `LIMIT ${filters.limit}` : "LIMIT 100";

  const { rows } = await neonQuery(
    `SELECT t.*, p.name as presenter_name, s.title as show_title
     FROM radio_tips t
     LEFT JOIN radio_presenters p ON t.presenter_id = p.id
     LEFT JOIN radio_show_slots sl ON t.slot_id = sl.id
     LEFT JOIN radio_shows s ON sl.show_id = s.id
     ${whereStr}
     ORDER BY t.created_at DESC
     ${limitClause}`,
    params
  );

  const { rows: stats } = await neonQuery(
    `SELECT 
       COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) as total_amount,
       COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
       COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
       COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
     FROM radio_tips`
  );

  return {
    tips: rows,
    totalAmount: Number(stats[0]?.total_amount || 0),
    completedCount: Number(stats[0]?.completed_count || 0),
    pendingCount: Number(stats[0]?.pending_count || 0),
    failedCount: Number(stats[0]?.failed_count || 0),
  };
}

// -------------------------------------------------------------
// Sponsors
// -------------------------------------------------------------

export async function getActiveRadioSponsors(): Promise<RadioSponsor[]> {
  const { rows } = await neonQuery(
    `SELECT * FROM radio_sponsors
     WHERE is_active = TRUE
       AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
       AND (ends_at IS NULL OR ends_at >= CURRENT_TIMESTAMP)
     ORDER BY created_at DESC`
  );
  return rows;
}

export async function createRadioSponsor(sponsor: Omit<RadioSponsor, "id" | "created_at">): Promise<RadioSponsor> {
  const { rows } = await neonQuery(
    `INSERT INTO radio_sponsors (name, logo_url, link_url, tagline, show_id, slot_id, is_active, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      sponsor.name,
      sponsor.logo_url || null,
      sponsor.link_url || null,
      sponsor.tagline || null,
      sponsor.show_id || null,
      sponsor.slot_id || null,
      sponsor.is_active ?? true,
      sponsor.starts_at || null,
      sponsor.ends_at || null,
    ]
  );
  return rows[0];
}

// -------------------------------------------------------------
// Audit Logging
// -------------------------------------------------------------

export async function recordRadioAuditLog(params: {
  adminActor: string;
  role?: string;
  action: string;
  targetType: string;
  targetId?: string | number | null;
  details?: any;
}): Promise<void> {
  try {
    await neonQuery(
      `INSERT INTO radio_audit_logs (admin_actor, role, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        params.adminActor,
        params.role || "superadmin",
        params.action,
        params.targetType,
        params.targetId ? String(params.targetId) : null,
        params.details ? JSON.stringify(params.details) : null,
      ]
    );
  } catch (err) {
    console.error("[Radio Audit] Failed to record audit log:", err);
  }
}
