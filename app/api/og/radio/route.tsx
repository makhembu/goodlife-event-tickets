import { ImageResponse } from "next/og";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { neonQuery } from "@/lib/supabase-db";
import { OG_SIZE, OG_WIDTH, OG_HEIGHT } from "@/lib/og-image";

export const runtime = "nodejs";

const BRAND_FONT = "Bebas Neue";
const NAVY = "#142B4C";
const NAVY_DEEP = "#0B1B2E";
const GOLD = "#C8A54A";
const CREAM = "#F3ECE1";

async function loadBrandFont() {
  try {
    const buffer = await fs.readFile(path.join(process.cwd(), "public", "BebasNeue.ttf"));
    return [{ name: BRAND_FONT, data: buffer, weight: 400 as const, style: "normal" as const }];
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const showSlug = searchParams.get("show");
  const presenterSlug = searchParams.get("presenter");

  let headline = "GOODLIFE RADIO 254";
  let subheadline = "24/7 LIVE FESTIVAL AIRWAVES";
  let metaInfo = "NAIROBI & MARARA CAMP · AFRO HOUSE · AMAPIANO · SHENG DROPS";
  let badgeText = "ON AIR · LIVE 24/7";
  let secondaryDetail = "STREAMING DIRECT FROM NAIROBI";

  try {
    if (showSlug) {
      const res = await neonQuery(
        `SELECT s.title, s.genre, s.description, p.dj_name
         FROM shows s
         LEFT JOIN presenters p ON s.host_presenter_id = p.id
         WHERE s.slug = $1 LIMIT 1;`,
        [showSlug]
      );
      if (res.rows && res.rows.length > 0) {
        const row = res.rows[0];
        headline = (row.title || "GOODLIFE SHOW").toUpperCase();
        subheadline = row.dj_name ? `HOSTED BY ${row.dj_name.toUpperCase()}` : "GOODLIFE RESIDENT";
        badgeText = "GOODLIFE SHOW";
        metaInfo = (row.genre || "AFRO HOUSE · AMAPIANO").toUpperCase();
        secondaryDetail = row.description ? row.description.slice(0, 80).toUpperCase() : "WEEKLY BROADCAST ON GOODLIFE 254";
      }
    } else if (presenterSlug) {
      const res = await neonQuery(
        `SELECT dj_name, bio FROM presenters WHERE slug = $1 LIMIT 1;`,
        [presenterSlug]
      );
      if (res.rows && res.rows.length > 0) {
        const row = res.rows[0];
        headline = (row.dj_name || "RESIDENT DJ").toUpperCase();
        subheadline = "OFFICIAL RESIDENT PRESENTER";
        badgeText = "RADIO PRESENTER";
        metaInfo = "GOODLIFE RADIO 254 RESIDENCY";
        secondaryDetail = row.bio ? row.bio.slice(0, 80).toUpperCase() : "LIVE BROADCASTS & FESTIVAL SETS";
      }
    } else {
      // Default: check if someone is on air right now
      const onAirRes = await neonQuery(
        `SELECT ss.starts_at, ss.ends_at, s.title as show_title, p.dj_name
         FROM show_slots ss
         JOIN shows s ON ss.show_id = s.id
         JOIN presenters p ON COALESCE(ss.substitute_presenter_id, ss.primary_presenter_id) = p.id
         WHERE ss.starts_at <= NOW() AND ss.ends_at >= NOW()
         LIMIT 1;`
      );
      if (onAirRes.rows && onAirRes.rows.length > 0) {
        const slot = onAirRes.rows[0];
        headline = slot.show_title.toUpperCase();
        subheadline = `LIVE ON AIR: ${slot.dj_name.toUpperCase()}`;
        badgeText = "LIVE ON AIR NOW";
        secondaryDetail = "TUNE IN NOW · GOODLIFE RADIO 254";
      }
    }
  } catch (err) {
    console.error("Error generating radio OG details:", err);
  }

  const fonts = await loadBrandFont();

  const response = new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          backgroundColor: NAVY,
          backgroundImage: `radial-gradient(circle at 15% 20%, rgba(200, 165, 74, 0.12) 0%, transparent 45%), radial-gradient(circle at 85% 80%, rgba(11, 27, 46, 0.9) 0%, transparent 50%)`,
          fontFamily: fonts ? `"${BRAND_FONT}", sans-serif` : "sans-serif",
          color: CREAM,
          padding: "54px 64px",
          position: "relative",
          overflow: "hidden",
          border: "8px solid #C8A54A",
          boxSizing: "border-box",
        }}
      >
        {/* Left Column: Titles and Information */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "66%",
            height: "100%",
            zIndex: 1,
          }}
        >
          {/* Header Row: Station brand & status badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "#DC2626",
                color: "#FFFFFF",
                padding: "6px 14px",
                fontSize: 18,
                letterSpacing: 2,
                fontWeight: "bold",
                borderRadius: 4,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "#FFFFFF",
                }}
              />
              <span>{badgeText}</span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "rgba(200, 165, 74, 0.15)",
                border: "1px solid #C8A54A",
                color: GOLD,
                padding: "6px 14px",
                fontSize: 18,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              254.0 FM · NAIROBI
            </div>
          </div>

          {/* Main Title & Subtitle */}
          <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
            <div
              style={{
                fontSize: headline.length > 24 ? 64 : 76,
                lineHeight: 1.05,
                color: "#FFFFFF",
                letterSpacing: 2,
                textTransform: "uppercase",
                maxWidth: 700,
              }}
            >
              {headline}
            </div>

            {/* Gold bar */}
            <div
              style={{
                width: 120,
                height: 5,
                background: GOLD,
                marginTop: 16,
                marginBottom: 16,
              }}
            />

            <div
              style={{
                fontSize: 30,
                letterSpacing: 2,
                color: GOLD,
                textTransform: "uppercase",
              }}
            >
              {subheadline}
            </div>

            <div
              style={{
                fontSize: 20,
                letterSpacing: 1.5,
                color: "rgba(243, 236, 225, 0.8)",
                marginTop: 12,
                textTransform: "uppercase",
              }}
            >
              {metaInfo}
            </div>
          </div>

          {/* Footer note */}
          <div
            style={{
              fontSize: 18,
              letterSpacing: 2,
              color: "rgba(243, 236, 225, 0.6)",
              textTransform: "uppercase",
            }}
          >
            {secondaryDetail} · GOODLIFE.CO.KE/RADIO
          </div>
        </div>

        {/* Right Column: Equalizer Graphic & Dial */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "34%",
            height: "100%",
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "space-between",
              width: 320,
              height: 440,
              background: NAVY_DEEP,
              border: `3px solid ${GOLD}`,
              padding: 24,
              boxShadow: "8px 8px 0px #0B1B2E",
            }}
          >
            {/* Top Dial */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: "100%",
                borderBottom: "1px solid rgba(200, 165, 74, 0.3)",
                paddingBottom: 12,
              }}
            >
              <div style={{ fontSize: 14, letterSpacing: 3, color: GOLD }}>FREQUENCY DIAL</div>
              <div style={{ fontSize: 50, color: "#FFFFFF", letterSpacing: 2 }}>254.0 MHZ</div>
            </div>

            {/* Live Audio Equalizer Bars */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                gap: 8,
                width: "100%",
                height: 160,
                padding: "10px 0",
              }}
            >
              <div style={{ width: 12, height: 60, background: "#10B981" }} />
              <div style={{ width: 12, height: 95, background: "#10B981" }} />
              <div style={{ width: 12, height: 130, background: GOLD }} />
              <div style={{ width: 12, height: 75, background: "#10B981" }} />
              <div style={{ width: 12, height: 155, background: "#EF4444" }} />
              <div style={{ width: 12, height: 110, background: GOLD }} />
              <div style={{ width: 12, height: 85, background: "#10B981" }} />
              <div style={{ width: 12, height: 135, background: GOLD }} />
              <div style={{ width: 12, height: 50, background: "#10B981" }} />
            </div>

            {/* Bottom Stream Quality Badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                background: "rgba(200, 165, 74, 0.12)",
                border: "1px solid rgba(200, 165, 74, 0.4)",
                padding: "8px 10px",
                fontSize: 14,
                letterSpacing: 2,
                color: GOLD,
                fontWeight: "bold",
              }}
            >
              MOBILE SAVER · 64 KBPS DUAL STREAM
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      ...(fonts ? { fonts } : {}),
      headers: {
        "content-type": "image/png",
        "cache-control": "public, immutable, no-transform, max-age=1800, s-maxage=3600",
      },
    }
  );

  return response;
}
