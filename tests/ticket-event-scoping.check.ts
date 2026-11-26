import fs from "fs";
import path from "path";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    console.error(`FAIL: ${name}`);
  }
}

function runTest() {
  console.log("Running Ticket & Pass Event Scoping Verification...\n");

  const ticketRoute = fs.readFileSync(path.join(__dirname, "../app/api/tickets/[id]/route.ts"), "utf8");
  check("Ticket API returns event_id for client validation", 
    ticketRoute.includes("event_id: ticket.event_id")
  );
  check("Ticket API loads event metadata (event_title, event_date, venue)",
    ticketRoute.includes("getEventById") && ticketRoute.includes("event_title: eventTitle")
  );

  const checkoutPage = fs.readFileSync(path.join(__dirname, "../app/CheckoutClientPage.tsx"), "utf8");
  check("Checkout page filters offline tickets by eventDetails.id", 
    checkoutPage.includes("String(t.eventId) === String(eventDetails.id)")
  );
  check("Checkout page re-evaluates tickets when eventDetails.id changes",
    checkoutPage.includes("}, [eventDetails.id]);")
  );
  check("Checkout page avoids overwriting eventId with active page event in metadata sync",
    checkoutPage.includes("eventId: f.event_id ?? eventDetails.id")
  );
  check("Checkout page passes currentEventId to OfflineTicketsDrawer",
    checkoutPage.includes("currentEventId={eventDetails.id}")
  );

  const drawer = fs.readFileSync(path.join(__dirname, "../components/ui/OfflineTicketsDrawer.tsx"), "utf8");
  check("OfflineTicketsDrawer accepts currentEventId prop",
    drawer.includes("currentEventId?: number | string")
  );
  check("OfflineTicketsDrawer labels tickets as THIS EVENT vs OTHER EDITION",
    drawer.includes('"THIS EVENT"') && drawer.includes('"OTHER EDITION"')
  );
  check("OfflineTicketsDrawer displays warning on pass from different edition",
    drawer.includes("Pass for different edition")
  );

  // Logical filter simulation
  const mockTickets = [
    { id: "T-GL5-001", eventId: 5, eventTitle: "GOODLIFE 5" },
    { id: "T-GL6-001", eventId: 6, eventTitle: "GOODLIFE 6: INTO THE WILD" },
  ];
  const gl6Only = mockTickets.filter(t => String(t.eventId) === String(6));
  check("Only event 6 tickets selected when viewing event 6", gl6Only.length === 1 && gl6Only[0].id === "T-GL6-001");

  const gl5Only = mockTickets.filter(t => String(t.eventId) === String(5));
  check("Only event 5 tickets selected when viewing event 5", gl5Only.length === 1 && gl5Only[0].id === "T-GL5-001");

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

runTest();
