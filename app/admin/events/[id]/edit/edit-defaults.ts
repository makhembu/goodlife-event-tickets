export function getDefaultWhatsAppTemplate(): string {
  return `*{{eventTitle}} TICKET CONFIRMED*\n\nTicket ID: {{ticketId}}\nAttendee: {{buyerName}}\nPhone: {{phoneNumber}}\nEvent: {{eventTitle}} {{eventSubtitle}}\nVenue: {{eventVenue}}\n📍 Directions: {{eventMapsUrl}}\n\nDownload the ticket PDF here: {{pdfUrl}}\n\nREGULATIONS:\n{{eventRegulations}}`;
}

export function getDefaultOperatorTemplate(): string {
  return `*NEW TICKET SECURED*\n\nBuyer: {{buyerName}}\nTicket Type: {{ticketType}} (Qty: {{quantity}})\nAmount Paid: KES {{amountPaid}}\nReference/ID: {{reference}}`;
}

export function getDefaultScanTemplate(): string {
  return `*{{eventTitle}} GATE ENTRY VALIDATED*\n\nTicket ID: {{ticketId}}\nAttendee: {{buyerName}}\nTicket Type: {{ticketType}}\nScanned By: {{scannerName}}\nTime: {{scanTime}}`;
}
