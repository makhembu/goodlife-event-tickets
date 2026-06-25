import { NextRequest, NextResponse } from "next/server";
import { getTicketById, fetchEventDetails, savePdfData } from "@/lib/supabase-db";
import { generateTicketPdf } from "@/lib/ticket-generator";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ticket = await getTicketById(id);

    if (!ticket) {
      return NextResponse.json(
        { error: `Ticket with ID ${id} not found` },
        { status: 404 }
      );
    }

    let pdfArray: Uint8Array;

    // Serve cached PDF if it exists – no regeneration needed
    if (ticket.pdf_data) {
      pdfArray = Uint8Array.from(Buffer.from(ticket.pdf_data, "base64"));
    } else {
      // First-ever download: generate, cache in DB, then serve
      const { origin } = new URL(request.url);
      const eventDetails = await fetchEventDetails();
      const pdfBuffer = await generateTicketPdf(ticket, origin, eventDetails);
      pdfArray = new Uint8Array(pdfBuffer);

      // Persist asynchronously – don't block the response
      const base64 = Buffer.from(pdfArray).toString("base64");
      savePdfData(id, base64).catch((e) =>
        console.error("savePdfData failed (non-fatal):", e)
      );
    }

    return new NextResponse(pdfArray as any, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="GOODLIFE-TICKET-${id}.pdf"`,
        // Allow browsers to cache the static PDF for 1 year
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error: any) {
    console.error("PDF generation api error:", error);
    return NextResponse.json(
      { error: "Internal Server Error rendering PDF: " + error.message },
      { status: 500 }
    );
  }
}
