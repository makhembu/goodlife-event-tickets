import { NextRequest, NextResponse } from "next/server";
import { getTicketById, getEventById, fetchActiveEvent, savePdfData } from "@/lib/supabase-db";
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
    const forceFresh = request.nextUrl.searchParams.get("force") === "true" || request.nextUrl.searchParams.get("fresh") === "1";

    // Serve cached PDF if it exists and fresh generation is not requested
    if (ticket.pdf_data && !forceFresh) {
      pdfArray = Uint8Array.from(Buffer.from(ticket.pdf_data, "base64"));
    } else {
      // First-ever download or force refresh: generate, cache in DB, then serve
      const { origin } = new URL(request.url);

      // Fetch the ticket's actual event, or fall back to active event
      let event = ticket.event_id ? await getEventById(ticket.event_id) : null;
      if (!event) {
        event = await fetchActiveEvent();
      }

      const pdfBuffer = await generateTicketPdf(ticket, origin, event);
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
