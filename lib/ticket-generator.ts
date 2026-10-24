import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import * as fs from "fs";
import * as path from "path";
import QRCode from "qrcode";
import sharp from "sharp";
import { EventDetails, Event, Ticket } from "./supabase-db-types";
import { resolveEventFlyer } from "./event-flyer";

function hex(h: string) {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255);
}

/**
 * Loads the flyer image buffer either from the local `public/` folder or an external URL.
 * Preserves the exact 14:9 aspect ratio via sharp 'cover' so the poster is NEVER squashed or compressed.
 */
async function loadFlyerBuffer(flyerUrl: string): Promise<{ buffer: Buffer; isPng: boolean } | null> {
  if (!flyerUrl) return null;
  try {
    const publicDir = path.join(process.cwd(), "public");
    let rawBuffer: Buffer;

    if (/^https?:\/\//i.test(flyerUrl)) {
      const res = await fetch(flyerUrl, { signal: AbortSignal.timeout(7000) });
      if (!res.ok) return null;
      rawBuffer = Buffer.from(await res.arrayBuffer());
    } else {
      const clean = flyerUrl.replace(/^[\\/]+/, "");
      const abs = path.resolve(publicDir, clean);
      if (!abs.startsWith(publicDir + path.sep) && abs !== publicDir) return null;
      if (!fs.existsSync(abs)) return null;
      rawBuffer = fs.readFileSync(abs);
    }

    // Proportional cover-crop: 840x540 matches 420x270 at 2x retina with ZERO height compression
    const processedBuffer = await sharp(rawBuffer)
      .resize(840, 540, { fit: "cover", position: "top" })
      .png()
      .toBuffer();

    return { buffer: processedBuffer, isPng: true };
  } catch (err) {
    console.warn("[ticket-generator] Failed to load/process flyer image:", err);
    return null;
  }
}

/**
 * Generates an ultra-sleek, modern festival mobile pass PDF (420 x 840 pt)
 * featuring the event poster at the top, Bebas Neue festival branding,
 * ticket tier badge, 2-column attendee metadata grid, gate validation QR code,
 * and Apple Wallet styling.
 */
export async function generateTicketPdf(
  ticket: {
    id: string;
    ticket_type: string;
    phone_number?: string;
    mpesa_receipt?: string;
    amount_paid: number;
    purchase_time?: string;
    buyer_name?: string;
    customer_name?: string;
    guest_count?: number;
    admitted_count?: number;
    is_scanned?: boolean;
  },
  domainUrl: string,
  eventDetails?: EventDetails | Event | null
): Promise<Buffer> {
  const width = 420;
  const height = 840;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const page = pdfDoc.addPage([width, height]);

  // Embed brand fonts
  const bebasPath = path.join(process.cwd(), "public", "BebasNeue.ttf");
  const bebasBytes = fs.readFileSync(bebasPath);
  const fDisplay = await pdfDoc.embedFont(bebasBytes);
  const fBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fReg = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Background: Deep Charcoal Ink (#111215)
  const BG_COLOR = rgb(17 / 255, 18 / 255, 21 / 255);
  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: BG_COLOR,
  });

  // Resolve event metadata
  const event = eventDetails || {
    title: "GOODLIFE",
    subtitle: "ELECTRONIC HOUSE MUSIC FESTIVAL",
    venue: "MARARA CAMP, THIKA",
    flyer_url: "/flyer.png",
  };

  const flyerPath = resolveEventFlyer(event);
  const flyerData = await loadFlyerBuffer(flyerPath);

  // Draw Top Flyer Poster Image if available
  const imgHeight = 270;
  if (flyerData && flyerData.buffer.length > 0) {
    try {
      const embeddedImg = flyerData.isPng
        ? await pdfDoc.embedPng(flyerData.buffer)
        : await pdfDoc.embedJpg(flyerData.buffer);

      page.drawImage(embeddedImg, {
        x: 0,
        y: height - imgHeight,
        width,
        height: imgHeight,
      });

      // Smooth dark gradient overlay at bottom of flyer image to blend into canvas
      const fadeStartY = height - imgHeight;
      const fadeHeight = 90;
      const steps = 18;
      for (let i = 0; i < steps; i++) {
        const fraction = i / steps;
        const opacity = Math.min(1, Math.max(0, (1 - fraction) ** 1.4));
        page.drawRectangle({
          x: 0,
          y: fadeStartY + (i * (fadeHeight / steps)),
          width,
          height: (fadeHeight / steps) + 1,
          color: BG_COLOR,
          opacity,
        });
      }
    } catch (e) {
      console.error("[ticket-generator] Failed to embed flyer image in PDF:", e);
    }
  }

  // Event Title: "GOODLIFE" or event.title
  const titleText = (event.title || "GOODLIFE").toUpperCase();
  const titleSize = 46;
  const titleWidth = fDisplay.widthOfTextAtSize(titleText, titleSize);
  const titleY = height - 295;

  page.drawText(titleText, {
    x: (width - titleWidth) / 2,
    y: titleY,
    size: titleSize,
    font: fDisplay,
    color: rgb(217 / 255, 195 / 255, 163 / 255), // Warm sand / light gold
  });

  // Subtitle: "ELECTRONIC HOUSE MUSIC FESTIVAL" or event.subtitle
  const rawSub = event.subtitle || "ELECTRONIC HOUSE MUSIC FESTIVAL";
  const subText = rawSub.toUpperCase().replace(/\s+/g, " ");
  let subSize = 8.5;
  while (fBold.widthOfTextAtSize(subText, subSize) > 360 && subSize > 6.5) {
    subSize -= 0.5;
  }
  const subWidth = fBold.widthOfTextAtSize(subText, subSize);
  page.drawText(subText, {
    x: (width - subWidth) / 2,
    y: titleY - 16,
    size: subSize,
    font: fBold,
    color: rgb(160 / 255, 152 / 255, 140 / 255),
  });

  // Category labels row (above pill)
  const catY = titleY - 42;
  const leftTag = (event.venue ? event.venue.split(",")[0] : "MARARA CAMP") + " // 237-THIKA";
  page.drawText(leftTag.toUpperCase(), {
    x: 35,
    y: catY,
    size: 9,
    font: fBold,
    color: rgb(130 / 255, 126 / 255, 120 / 255),
  });

  // Right tag: VIP ACCESS / ADMIT N / GENERAL ADMISSION
  const guestCount = ticket.guest_count || 1;
  const isVip = /vip|backstage|artist/i.test(ticket.ticket_type || "");
  const vipText = guestCount > 1 ? `ADMIT ${guestCount}` : (isVip ? "VIP ACCESS" : "GENERAL ADMISSION");
  const vipWidth = fBold.widthOfTextAtSize(vipText, 9.5);
  page.drawText(vipText, {
    x: width - 35 - vipWidth,
    y: catY,
    size: 9.5,
    font: fBold,
    color: rgb(223 / 255, 187 / 255, 125 / 255), // #DFBB7D
  });

  // Tier Pill Box: "EARLY BIRD PASS // KES 450"
  const pillY = catY - 50;
  const pillHeight = 44;
  page.drawRectangle({
    x: 35,
    y: pillY,
    width: 350,
    height: pillHeight,
    color: rgb(22 / 255, 24 / 255, 29 / 255),
    borderColor: rgb(223 / 255, 187 / 255, 125 / 255),
    borderWidth: 1.5,
  });

  const tierName = (ticket.ticket_type || "FESTIVAL PASS").toUpperCase();
  const priceDisplay = Number(ticket.amount_paid) > 0 ? `KES ${Number(ticket.amount_paid).toLocaleString()}` : "COMPLIMENTARY";
  const tierPassText = `${tierName} // ${priceDisplay}`;
  let tierPassSize = 22;
  while (fDisplay.widthOfTextAtSize(tierPassText, tierPassSize) > 330 && tierPassSize > 14) {
    tierPassSize -= 1;
  }
  const tierPassWidth = fDisplay.widthOfTextAtSize(tierPassText, tierPassSize);
  page.drawText(tierPassText, {
    x: (width - tierPassWidth) / 2,
    y: pillY + 12,
    size: tierPassSize,
    font: fDisplay,
    color: rgb(245 / 255, 200 / 255, 66 / 255), // #F5C842 Vivid Gold
  });

  // 2-Column Info Grid Card
  const gridY = pillY - 100;
  const gridHeight = 90;
  const gridWidth = 350;
  const gridX = 35;

  page.drawRectangle({
    x: gridX,
    y: gridY,
    width: gridWidth,
    height: gridHeight,
    color: rgb(20 / 255, 22 / 255, 26 / 255),
    borderColor: rgb(40 / 255, 43 / 255, 50 / 255),
    borderWidth: 1,
  });

  // Vertical separator
  page.drawLine({
    start: { x: gridX + 175, y: gridY },
    end: { x: gridX + 175, y: gridY + gridHeight },
    color: rgb(35 / 255, 38 / 255, 44 / 255),
    thickness: 1,
  });

  // Horizontal separator
  page.drawLine({
    start: { x: gridX, y: gridY + 45 },
    end: { x: gridX + gridWidth, y: gridY + 45 },
    color: rgb(35 / 255, 38 / 255, 44 / 255),
    thickness: 1,
  });

  // Resolve Doors time
  let doorsTime = "12:00 PM";
  if ((event as any)?.recurrence_time) {
    doorsTime = (event as any).recurrence_time.toUpperCase();
  } else if ((event as any)?.doors_open) {
    doorsTime = (event as any).doors_open.toUpperCase();
  }

  // Row 1: DOORS | LOCATION
  page.drawText("DOORS", {
    x: gridX + 14,
    y: gridY + 73,
    size: 7.5,
    font: fBold,
    color: rgb(120 / 255, 118 / 255, 112 / 255),
  });
  page.drawText(doorsTime, {
    x: gridX + 14,
    y: gridY + 55,
    size: 12.5,
    font: fBold,
    color: rgb(250 / 255, 250 / 255, 250 / 255),
  });

  page.drawText("LOCATION:", {
    x: gridX + 190,
    y: gridY + 73,
    size: 7.5,
    font: fBold,
    color: rgb(120 / 255, 118 / 255, 112 / 255),
  });
  const venueStr = (event.venue || "MARARA CAMP, THIKA").toUpperCase();
  let venueSize = 10.5;
  while (fBold.widthOfTextAtSize(venueStr, venueSize) > 146 && venueSize > 7.5) {
    venueSize -= 0.5;
  }
  page.drawText(venueStr, {
    x: gridX + 190,
    y: gridY + 55,
    size: venueSize,
    font: fBold,
    color: rgb(250 / 255, 250 / 255, 250 / 255),
  });

  // Row 2: GUEST | STATUS
  page.drawText("GUEST:", {
    x: gridX + 14,
    y: gridY + 30,
    size: 7.5,
    font: fBold,
    color: rgb(120 / 255, 118 / 255, 112 / 255),
  });
  const attendeeName = (ticket.buyer_name || ticket.customer_name || "GUEST").toUpperCase();
  let guestSize = 12;
  while (fBold.widthOfTextAtSize(attendeeName, guestSize) > 150 && guestSize > 8) {
    guestSize -= 0.5;
  }
  page.drawText(attendeeName, {
    x: gridX + 14,
    y: gridY + 12,
    size: guestSize,
    font: fBold,
    color: rgb(250 / 255, 250 / 255, 250 / 255),
  });

  page.drawText("STATUS:", {
    x: gridX + 190,
    y: gridY + 30,
    size: 7.5,
    font: fBold,
    color: rgb(120 / 255, 118 / 255, 112 / 255),
  });

  // Status pill badge: "CONFIRMED" or "ADMITTED" (clean spacing, zero overlap)
  const statusLabel = ticket.is_scanned ? "ADMITTED" : "CONFIRMED";
  const statusPillW = 86;
  const statusPillH = 17;
  page.drawRectangle({
    x: gridX + 190,
    y: gridY + 8,
    width: statusPillW,
    height: statusPillH,
    color: rgb(45 / 255, 36 / 255, 10 / 255),
    borderColor: rgb(245 / 255, 200 / 255, 66 / 255),
    borderWidth: 1,
  });
  const statusTextW = fBold.widthOfTextAtSize(statusLabel, 8);
  page.drawText(statusLabel, {
    x: gridX + 190 + (statusPillW - statusTextW) / 2,
    y: gridY + 13,
    size: 8,
    font: fBold,
    color: rgb(245 / 255, 200 / 255, 66 / 255),
  });

  // QR Code Slate Card
  const qrCardW = 270;
  const qrCardH = 260;
  const qrCardX = (width - qrCardW) / 2;
  const qrCardY = gridY - 275;

  page.drawRectangle({
    x: qrCardX,
    y: qrCardY,
    width: qrCardW,
    height: qrCardH,
    color: rgb(23 / 255, 25 / 255, 30 / 255),
    borderColor: rgb(45 / 255, 48 / 255, 56 / 255),
    borderWidth: 1,
  });

  // Golden accent corners on the QR card
  const cLen = 14;
  const gold = rgb(223 / 255, 187 / 255, 125 / 255);
  // Top-left
  page.drawLine({ start: { x: qrCardX + 10, y: qrCardY + qrCardH - 10 }, end: { x: qrCardX + 10 + cLen, y: qrCardY + qrCardH - 10 }, color: gold, thickness: 1.5 });
  page.drawLine({ start: { x: qrCardX + 10, y: qrCardY + qrCardH - 10 }, end: { x: qrCardX + 10, y: qrCardY + qrCardH - 10 - cLen }, color: gold, thickness: 1.5 });
  // Top-right
  page.drawLine({ start: { x: qrCardX + qrCardW - 10, y: qrCardY + qrCardH - 10 }, end: { x: qrCardX + qrCardW - 10 - cLen, y: qrCardY + qrCardH - 10 }, color: gold, thickness: 1.5 });
  page.drawLine({ start: { x: qrCardX + qrCardW - 10, y: qrCardY + qrCardH - 10 }, end: { x: qrCardX + qrCardW - 10, y: qrCardY + qrCardH - 10 - cLen }, color: gold, thickness: 1.5 });
  // Bottom-left
  page.drawLine({ start: { x: qrCardX + 10, y: qrCardY + 10 }, end: { x: qrCardX + 10 + cLen, y: qrCardY + 10 }, color: gold, thickness: 1.5 });
  page.drawLine({ start: { x: qrCardX + 10, y: qrCardY + 10 }, end: { x: qrCardX + 10, y: qrCardY + 10 + cLen }, color: gold, thickness: 1.5 });
  // Bottom-right
  page.drawLine({ start: { x: qrCardX + qrCardW - 10, y: qrCardY + 10 }, end: { x: qrCardX + qrCardW - 10 - cLen, y: qrCardY + 10 }, color: gold, thickness: 1.5 });
  page.drawLine({ start: { x: qrCardX + qrCardW - 10, y: qrCardY + 10 }, end: { x: qrCardX + qrCardW - 10, y: qrCardY + 10 + cLen }, color: gold, thickness: 1.5 });

  // Generate Gate Scan QR code
  const scanUrl = `${domainUrl.replace(/\/$/, "")}/admin/scanner?ticket=${ticket.id}`;
  const qrDataUrl = await QRCode.toDataURL(scanUrl, {
    width: 220,
    margin: 1,
    color: {
      dark: "#111215",
      light: "#FFFFFF",
    },
  });
  const qrImageBytes = Buffer.from(qrDataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
  const qrImg = await pdfDoc.embedPng(qrImageBytes);
  const qrSize = 190;
  page.drawImage(qrImg, {
    x: (width - qrSize) / 2,
    y: qrCardY + (qrCardH - qrSize) / 2,
    width: qrSize,
    height: qrSize,
  });

  // Footer: Ticket serial & security hash (clean, balanced at base)
  const shortTicketId = ticket.id.length > 20 ? ticket.id.slice(0, 20) : ticket.id;
  const mpesaRef = ticket.mpesa_receipt ? `  --  M-PESA: ${ticket.mpesa_receipt}` : "";
  const footerText = `TICKET ID: ${shortTicketId}${mpesaRef}  --  GOODLIFE FESTIVALS`;
  const footerW = fBold.widthOfTextAtSize(footerText, 7);
  page.drawText(footerText, {
    x: (width - footerW) / 2,
    y: 22,
    size: 7,
    font: fBold,
    color: rgb(180 / 255, 175 / 255, 168 / 255),
  });

  const subFooter = "OFFICIAL DIGITAL PASS  --  PRESENT QR AT ENTRANCE GATE FOR ENTRY";
  const subFooterW = fReg.widthOfTextAtSize(subFooter, 6);
  page.drawText(subFooter, {
    x: (width - subFooterW) / 2,
    y: 11,
    size: 6,
    font: fReg,
    color: rgb(110 / 255, 110 / 255, 115 / 255),
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
