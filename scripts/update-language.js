const fs = require('fs');

function replaceInFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf8');
  for (const [search, replace] of replacements) {
    content = content.split(search).join(replace);
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

// app/page.tsx replacements
replaceInFile('./app/page.tsx', [
  ['System Manifest', 'Admin Console'],
  ['EVENT PROTOCOL', 'HOUSE RULES'],
  ['SECURE CHECKOUT', 'GET YOUR PASSES'],
  ['01. SELECT TIER', '01. CHOOSE PACKAGE'],
  ['02. IDENTITY MANIFEST', '02. YOUR DETAILS'],
  ['03. QUANTITY & TOTAL', '03. HOW MANY PASSES?'],
  ['04. MOBILE DISPATCH', '04. M-PESA NUMBER'],
  ['AUTHORIZE PAYMENT', 'PAY WITH M-PESA'],
  ['SYSTEM ALERT', 'PAYMENT UPDATE'],
  ['TICKET LEDGER ', 'YOUR TICKET '],
  [' WRITTEN. \n                      AVAILABLE FOR LOCAL DOWNLOAD OR WHATSAPP RETRIEVAL.', ' IS READY. \n                      DOWNLOAD IT BELOW OR CHECK YOUR WHATSAPP.'],
  ['SECURED!', "YOU'RE IN!"],
  ['PULL PDF', 'DOWNLOAD TICKET'],
  ['SYSTEM DIV.', 'TICKETING'],
  ['STRICTLY 18+ SECURITY MANDATED', 'STRICTLY 18+ NO OUTSIDE DRINKS']
]);

// app/admin/dashboard/page.tsx replacements
replaceInFile('./app/admin/dashboard/page.tsx', [
  ['MASTER LEDGER OVERWATCH', 'GOODLIFE BOX OFFICE'],
  [' CONSOLE', ' ADMIN'],
  ['SYNCHRONIZING SECURE METRICS LEDGER...', 'LOADING BOX OFFICE METRICS...'],
  ['TILL 5761205 TOTALS', 'TILL 5761205 REVENUE'],
  ['TOTAL PASSES SOLD', 'PASSES SOLD'],
  ['VELOCITY (24H)', 'RECENT SALES (24H)'],
  ['PHYSICAL GATE ENTRY', 'CHECKED-IN GUESTS'],
  ['CAMPING CAPACITY MONITOR CAPS', 'CAMPING PACKAGE AVAILABILITY'],
  ['Ledger Transactions', 'Ticket Sales'],
  ['Ticket Tiers Settings', 'Ticket Tiers'],
  ['AUDIT CHANNELS AND TRANSACTIONS', 'TICKET SALES LOG'],
  ['Audit channels and transactions', 'Ticket sales log'],
  ['Audit system syncing active. Standard UTC clock time', 'Sales system active']
]);

// app/admin/scanner/page.tsx replacements
replaceInFile('./app/admin/scanner/page.tsx', [
  ['GATE ADMIN', 'GATE CHECK-IN'],
  ['1. SCANNER GUARDIAN ASSIGNMENT', '1. STAFF NAME'],
  ['Assign Scanned By Name...', 'Enter your name...'],
  ['LIVE SECURITY CONTROLLERS', 'QR SCANNER'],
  ['Camera hardware is locked to guard gate. Click below to engage stream permissions.', 'Camera is offline. Click below to enable scanner.'],
  ['START GATE CAMERA', 'START SCANNER'],
  ['2. MANUAL BYPASS TICKET KEYPAD (GL-RECEIPT)', '2. MANUAL TICKET LOOKUP'],
  ['VALID ENTRY SEED', 'TICKET VALID'],
  ['SECURITY THREAT / DOUBLE ADMIT', 'INVALID OR ALREADY USED'],
  ['3. WORKSTATION CHECK-IN STACK HISTORY', '3. RECENT SCANS']
]);

console.log('Language toned down successfully.');
