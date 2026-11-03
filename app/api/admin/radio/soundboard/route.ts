// app/api/admin/radio/soundboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { SoundboardBankItem, SoundboardPadItem, DropVaultOption } from "@/lib/radio/soundboard-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    // 1. Fetch Banks
    const banksRes = await neonQuery(
      `SELECT id, name, position, created_at, updated_at
       FROM soundboard_banks
       ORDER BY position ASC, id ASC`
    );

    // 2. Fetch Pads
    const padsRes = await neonQuery(
      `SELECT id, bank_id, position, label, emoji, color, audio_url, drop_id, created_at, updated_at
       FROM soundboard_pads
       ORDER BY position ASC, id ASC`
    );

    // Group pads by bank_id
    const padsByBank = new Map<number, SoundboardPadItem[]>();
    for (const pad of padsRes.rows as SoundboardPadItem[]) {
      const list = padsByBank.get(pad.bank_id) || [];
      list.push(pad);
      padsByBank.set(pad.bank_id, list);
    }

    const banks: SoundboardBankItem[] = (banksRes.rows as any[]).map((b) => ({
      ...b,
      pads: padsByBank.get(b.id) || [],
    }));

    // 3. Fetch recent drops from Drops Vault (for the clip picker)
    const dropsRes = await neonQuery(
      `SELECT id, title, persona, mood, audio_url, script, created_at
       FROM radio_drops
       WHERE audio_url IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 60`
    );

    return NextResponse.json(
      {
        banks,
        drops: dropsRes.rows as DropVaultOption[],
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[api/admin/radio/soundboard] GET error:", err.message);
    return NextResponse.json({ error: err.message, banks: [], drops: [] }, { status: 500 });
  }
}
