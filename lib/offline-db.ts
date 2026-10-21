/**
 * IndexedDB Client for GOODLIFE Offline Storage
 * Database: goodlife_offline_store (version 1)
 *
 * Stores:
 * - draft_orders: Keyed by draft_id (idempotency key). Stores draft ticket selections.
 * - offline_tickets: Keyed by ticket_id. Stores purchased tickets & cached QR details.
 * - active_payments: Keyed by reference. Tracks in-flight payment states.
 */

const DB_NAME = "goodlife_offline_store";
const DB_VERSION = 1;

export interface DraftOrder {
  id: string; // client-generated idempotency key (UUID)
  eventId: number;
  eventTitle: string;
  ticketType: string;
  ticketName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  buyerName: string;
  phoneNumber: string;
  whatsappNumber?: string;
  createdAt: number; // timestamp
  updatedAt: number;
}

export interface CachedTicket {
  id: string; // ticket_id e.g. GL-XXXXXX
  eventId?: number | null;
  eventTitle: string;
  eventDate?: string | null;
  venue?: string | null;
  buyerName: string;
  ticketType: string;
  amountPaid: number;
  purchaseTime: string;
  mpesaReceipt?: string | null;
  qrPayload?: string; // QR code data representation
  savedAt: number;
}

export interface ActivePayment {
  reference: string;
  merchantReference: string;
  idempotencyKey: string;
  phoneNumber: string;
  amount: number;
  ticketType: string;
  quantity: number;
  buyerName: string;
  status: "PROMPT_SENT" | "POLLING" | "PAID" | "FAILED" | "TIMED_OUT";
  initiatedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      return reject(new Error("IndexedDB is not supported on this device."));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("draft_orders")) {
        db.createObjectStore("draft_orders", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("offline_tickets")) {
        db.createObjectStore("offline_tickets", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("active_payments")) {
        db.createObjectStore("active_payments", { keyPath: "reference" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ----------------- DRAFT ORDERS -----------------

export async function saveDraftOrder(draft: DraftOrder): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("draft_orders", "readwrite");
    const store = tx.objectStore("draft_orders");
    const req = store.put(draft);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getDraftOrder(id: string): Promise<DraftOrder | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("draft_orders", "readonly");
    const store = tx.objectStore("draft_orders");
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllDraftOrders(): Promise<DraftOrder[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("draft_orders", "readonly");
    const store = tx.objectStore("draft_orders");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteDraftOrder(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("draft_orders", "readwrite");
    const store = tx.objectStore("draft_orders");
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ----------------- OFFLINE TICKETS -----------------

export async function saveOfflineTicket(ticket: CachedTicket): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("offline_tickets", "readwrite");
    const store = tx.objectStore("offline_tickets");
    const req = store.put(ticket);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function saveOfflineTickets(tickets: CachedTicket[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("offline_tickets", "readwrite");
    const store = tx.objectStore("offline_tickets");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    for (const t of tickets) {
      store.put(t);
    }
  });
}

export async function getAllOfflineTickets(): Promise<CachedTicket[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("offline_tickets", "readonly");
    const store = tx.objectStore("offline_tickets");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function removeOfflineTicket(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("offline_tickets", "readwrite");
    const store = tx.objectStore("offline_tickets");
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ----------------- ACTIVE PAYMENTS -----------------

export async function saveActivePayment(payment: ActivePayment): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("active_payments", "readwrite");
    const store = tx.objectStore("active_payments");
    const req = store.put(payment);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getActivePayment(reference: string): Promise<ActivePayment | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("active_payments", "readonly");
    const store = tx.objectStore("active_payments");
    const req = store.get(reference);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteActivePayment(reference: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("active_payments", "readwrite");
    const store = tx.objectStore("active_payments");
    const req = store.delete(reference);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
