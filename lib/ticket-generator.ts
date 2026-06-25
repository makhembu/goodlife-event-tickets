import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import * as fs from "fs";
import * as path from "path";
import QRCode from "qrcode";
import { EventDetails } from "./supabase-db";

function hex(h: string) {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255);
}

// Draw text with manual letter-tracking (spacing between chars)
function drawTracked(
  page: any, text: string, font: any, size: number,
  x: number, y: number, color: any, tracking = 0
): number {
  let cx = x;
  for (const char of text) {
    page.drawText(char, { x: cx, y, size, font, color });
    cx += font.widthOfTextAtSize(char, size) + tracking;
  }
  return cx - x; // total width used
}

// Center tracked text in a region
function centerTracked(
  page: any, text: string, font: any, size: number,
  regionX: number, regionW: number, y: number, color: any, tracking = 0
) {
  let totalW = 0;
  for (const char of text) totalW += font.widthOfTextAtSize(char, size) + tracking;
  totalW -= tracking;
  drawTracked(page, text, font, size, regionX + (regionW - totalW) / 2, y, color, tracking);
}

// Draw a field label + value pair, cleanly
function drawField(
  page: any,
  label: string, value: string,
  x: number, y: number,
  fBold: any, fDisplay: any,
  labelColor: any, valueColor: any
) {
  // Label: small, tracked, bold
  drawTracked(page, label, fBold, 8, x, y + 16, labelColor, 1.5);
  // Thick brutalist underline under label
  const lw = label.length * (8 * 0.55) + label.length * 1.5;
  page.drawLine({
    start: { x, y: y + 13 },
    end:   { x: x + lw, y: y + 13 },
    thickness: 2,
    color: labelColor
  });
  // Value: bigger, display font
  page.drawText(value, { x, y, size: 14, font: fBold, color: valueColor });
}

export async function generateTicketPdf(
  ticket: {
    id: string;
    ticket_type: string;
    phone_number: string;
    mpesa_receipt: string;
    amount_paid: number;
    purchase_time: string;
    buyer_name: string;
  },
  domainUrl: string,
  eventDetails?: EventDetails
): Promise<Buffer> {
  const event = eventDetails || {
    title: "GOODLIFE",
    subtitle: "237-THIKA | JULY 11",
    tag: "SMWHR INC",
    venue: "MARARA CAMP, THIKA",
    till_number: "5761205",
    flyer_url: "/flyer.png",
    regulations: ""
  };

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  // ── Landscape: 660 x 250 pt ───────────────────────────────────────────────
  const W = 660;
  const H = 250;
  const page = pdfDoc.addPage([W, H]);

  const fBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Bebas Neue — matches the flyer's display type, embedded from public/
  const bebasPath = path.join(process.cwd(), "public", "BebasNeue.ttf");
  const bebasBytes = fs.readFileSync(bebasPath);
  const fDisplay = await pdfDoc.embedFont(bebasBytes);

  // ── Palette (Editorial Brutalism) ─────────────────────────────────────────
  const BRAND_OFF_WHITE = hex("#F2EFEB");
  const BRAND_BLACK     = hex("#050505");
  const BRAND_ACCENT    = hex("#FF3300");
  const WHITE           = rgb(1, 1, 1);

  // ── Zone boundaries ───────────────────────────────────────────────────────
  const STUB_X = 418;
  const QR_X   = 456;
  const QR_W   = W - QR_X;

  // ── Background ────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: BRAND_OFF_WHITE });

  // ── Outer thick border ────────────────────────────────────────────────────
  page.drawRectangle({ 
    x: 4, y: 4, 
    width: W - 8, height: H - 8, 
    borderColor: BRAND_BLACK, borderWidth: 4, 
    color: undefined 
  });

  // Top Accent Stripe inside the border
  page.drawRectangle({ x: 4, y: H - 12, width: W - 8, height: 8, color: BRAND_ACCENT });
  page.drawLine({ start: {x: 4, y: H - 12}, end: {x: W - 4, y: H - 12}, thickness: 2, color: BRAND_BLACK });

  // ── Stub panel ────────────────────────────────────────────────────────────
  page.drawRectangle({ x: STUB_X, y: 4, width: QR_X - STUB_X, height: H - 8, color: BRAND_BLACK });

  // Tear dashes
  for (let y = 16; y < H - 16; y += 12) {
    page.drawLine({
      start: { x: STUB_X + (QR_X - STUB_X) / 2, y },
      end:   { x: STUB_X + (QR_X - STUB_X) / 2, y: y + 6 },
      thickness: 2,
      color: BRAND_OFF_WHITE
    });
  }

  // Vertical "ADMIT ONE" label on the stub
  const stubLabel = "ADMIT ONE";
  const sSize = 12;
  const totalLH = stubLabel.length * (sSize + 4);
  let sy = (H + totalLH) / 2 - sSize;
  for (const char of stubLabel) {
    const cw = fDisplay.widthOfTextAtSize(char, sSize);
    page.drawText(char, {
      x: STUB_X + (QR_X - STUB_X) / 2 - cw / 2,
      y: sy,
      size: sSize,
      font: fDisplay,
      color: BRAND_OFF_WHITE
    });
    sy -= (sSize + 4);
  }

  // ── QR panel divider ──────────────────────────────────────────────────────
  page.drawLine({ start: {x: QR_X, y: 4}, end: {x: QR_X, y: H - 4}, thickness: 4, color: BRAND_BLACK });

  // ── QR Code ───────────────────────────────────────────────────────────────
  const scanUrl = `${domainUrl.replace(/\/$/, "")}/admin/scanner?ticket=${ticket.id}`;
  const qrDataUrl = await QRCode.toDataURL(scanUrl, {
    margin: 1, width: 240,
    color: { dark: "#050505", light: "#FFFFFF" }
  });
  const qrImg = await pdfDoc.embedPng(Buffer.from(
    qrDataUrl.replace(/^data:image\/png;base64,/, ""), "base64"
  ));

  const QR_SIZE = 138;
  const qrX = QR_X + (QR_W - QR_SIZE) / 2;
  const qrY = (H - QR_SIZE) / 2 + 10;

  // Brutalist shadow for QR
  page.drawRectangle({
    x: qrX + 6, y: qrY - 6,
    width: QR_SIZE, height: QR_SIZE,
    color: BRAND_BLACK
  });
  
  // White quiet zone / Border for QR
  page.drawRectangle({
    x: qrX, y: qrY,
    width: QR_SIZE, height: QR_SIZE,
    color: WHITE,
    borderColor: BRAND_BLACK,
    borderWidth: 3
  });
  page.drawImage(qrImg, { x: qrX + 3, y: qrY + 3, width: QR_SIZE - 6, height: QR_SIZE - 6 });

  // Labels below QR
  centerTracked(page, "SCAN AT GATE", fDisplay, 14, QR_X, QR_W, qrY - 24, BRAND_ACCENT, 1.5);

  const shortId = ticket.id.length > 16 ? ticket.id.slice(0, 16) : ticket.id;
  centerTracked(page, shortId, fBold, 7, QR_X, QR_W, qrY - 36, BRAND_BLACK, 0.5);

  // Powered by
  centerTracked(page, "GOODLIFE TICKETING", fDisplay, 11, QR_X, QR_W, 14, BRAND_BLACK, 1.2);

  // ════════════════════════════════════════════════════════════════════════
  // MAIN PANEL
  // ════════════════════════════════════════════════════════════════════════

  const PX = 24;
  const CONTENT_W = STUB_X - PX - 12;

  // ── Fixed Y anchors ───────────────────────────────────────────────────────
  const TITLE_SIZE = 58;
  const TITLE_Y    = H - 24 - TITLE_SIZE;    // 168
  const SUB_Y      = TITLE_Y - 22;           // 146
  const RULE_Y     = SUB_Y - 14;             // 132
  const ROW_GAP    = 42;                     // space between field rows
  const F1_Y       = RULE_Y - 32;            // 100
  const F2_Y       = F1_Y - ROW_GAP;         // 58
  const PRICE_Y    = F2_Y - 36;              // 22

  // ── GOODLIFE Title ────────────────────────────────────────────────────────
  const titleStr = event.title.toUpperCase();
  const titleTracking = 6.0;
  drawTracked(page, titleStr, fDisplay, TITLE_SIZE, PX, TITLE_Y, BRAND_BLACK, titleTracking);

  // ── Subtitle: date + venue ────────────────────────────────────────────────
  const subStr = `${event.subtitle.toUpperCase()}   /   ${event.venue.toUpperCase()}`;
  drawTracked(page, subStr, fDisplay, 16, PX + 2, SUB_Y, BRAND_ACCENT, 1.5);

  // ── Thick Rule ────────────────────────────────────────────────────────────
  page.drawLine({
    start: { x: PX + 2, y: RULE_Y },
    end:   { x: STUB_X - 16, y: RULE_Y },
    thickness: 4, color: BRAND_BLACK
  });

  // ── Fields 2×2 grid ───────────────────────────────────────────────────────
  const col1X = PX + 2;
  const col2X = col1X + 192;
  const MAX_VAL_W = 180;

  const leftFields:  [string, string, number][] = [
    ["ATTENDEE",  ticket.buyer_name.toUpperCase(), F1_Y],
    ["PHONE",     ticket.phone_number,              F2_Y],
  ];
  const rightFields: [string, string, number][] = [
    ["TICKET TYPE", ticket.ticket_type.toUpperCase(), F1_Y],
    ["M-PESA REF",  ticket.mpesa_receipt.toUpperCase(), F2_Y],
  ];

  for (const [label, rawVal, fy] of leftFields) {
    let val = rawVal;
    while (fBold.widthOfTextAtSize(val, 14) > MAX_VAL_W && val.length > 3) val = val.slice(0, -1);
    if (val !== rawVal) val += "..";
    drawField(page, label, val, col1X, fy, fBold, fDisplay, BRAND_ACCENT, BRAND_BLACK);
  }
  for (const [label, rawVal, fy] of rightFields) {
    let val = rawVal;
    while (fBold.widthOfTextAtSize(val, 14) > MAX_VAL_W && val.length > 3) val = val.slice(0, -1);
    if (val !== rawVal) val += "..";
    drawField(page, label, val, col2X, fy, fBold, fDisplay, BRAND_ACCENT, BRAND_BLACK);
  }

  // ── Price ─────────────────────────────────────────────────────────────────
  drawTracked(page, "AMOUNT PAID", fBold, 8, PX + 2, PRICE_Y + 18, BRAND_BLACK, 1.2);
  drawTracked(page, `KES ${Number(ticket.amount_paid).toLocaleString()}`, fDisplay, 22, PX + 2, PRICE_Y, BRAND_ACCENT, 1.0);

  // ── Brutalist Box Tag (Bottom right of main panel) ────────────────────────
  const orgStr = event.tag.toUpperCase();
  const orgTotalW = [...orgStr].reduce((s, c) => s + fDisplay.widthOfTextAtSize(c, 12) + 1.5, 0);
  const tagH = 20;
  
  // Shadow box
  page.drawRectangle({
    x: STUB_X - orgTotalW - 20, y: PRICE_Y - 4,
    width: orgTotalW + 12, height: tagH,
    color: BRAND_BLACK
  });
  // Actual tag box
  page.drawRectangle({
    x: STUB_X - orgTotalW - 22, y: PRICE_Y - 2,
    width: orgTotalW + 12, height: tagH,
    color: BRAND_ACCENT,
    borderColor: BRAND_BLACK,
    borderWidth: 2
  });
  drawTracked(page, orgStr, fDisplay, 12, STUB_X - orgTotalW - 16, PRICE_Y + 3, BRAND_BLACK, 1.5);

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
