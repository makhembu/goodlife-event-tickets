const fs = require('fs');

// ==========================================
// 1. Update lib/supabase-db.ts
// ==========================================
const dbFile = 'lib/supabase-db.ts';
let dbRaw = fs.readFileSync(dbFile, 'utf8');
const isDbCRLF = dbRaw.includes('\r\n');
let dbCode = isDbCRLF ? dbRaw.replace(/\r\n/g, '\n') : dbRaw;

// A. Add is_house to Vendor interface
const vInterfaceOld = `export interface Vendor {
  id: number;
  name: string;
  contact_phone: string;
  contact_name: string;
  logo_url: string;
  category?: 'commercial' | 'operational' | string;
  pay_ref_prefix?: string | null;
  created_at: string;
}`;
const vInterfaceNew = `export interface Vendor {
  id: number;
  name: string;
  contact_phone: string;
  contact_name: string;
  logo_url: string;
  category?: 'commercial' | 'operational' | string;
  is_house?: boolean;
  pay_ref_prefix?: string | null;
  created_at: string;
}`;
if (!dbCode.includes(vInterfaceOld)) {
  console.error("Vendor interface not found in lib/supabase-db.ts");
  process.exit(1);
}
dbCode = dbCode.replace(vInterfaceOld, vInterfaceNew);

// B. Update fetchSettlementsForEvent query 1 (with eventId)
const q1Old = `        v.contact_phone,
        v.logo_url,
        COALESCE(vea.id, 0) as id,
        COALESCE(vea.event_id, $1) as event_id,
        COALESCE(e.title, 'Event #' || $1) as event_title,
        COALESCE(vea.commission_rate, 10.0) as commission_rate,
        COALESCE(vea.flat_fee, 0) as flat_fee,
        COALESCE(vea.settled_amount, 0) as settled_amount,
        COALESCE(vea.status, 'active') as status,
        COALESCE(sales_summary.total_sales, vea.total_sales, 0) as total_sales,
        COALESCE(sales_summary.order_count, 0) as order_count,
        COALESCE(sales_summary.cash_collected, 0) as cash_collected,
        COALESCE(sales_summary.mpesa_collected, 0) as mpesa_collected,
        COALESCE(sales_summary.tab_collected, 0) as tab_collected,
        (COALESCE(sales_summary.mpesa_collected, 0) + COALESCE(sales_summary.tab_collected, 0)) as digital_collected,
        ROUND((COALESCE(sales_summary.total_sales, vea.total_sales, 0) * COALESCE(vea.commission_rate, 10.0) / 100.0), 2) as commission_owed,
        ROUND(COALESCE(sales_summary.total_sales, vea.total_sales, 0) - (COALESCE(sales_summary.total_sales, vea.total_sales, 0) * COALESCE(vea.commission_rate, 10.0) / 100.0), 2) as vendor_net_share,`;

const q1New = `        v.contact_phone,
        v.logo_url,
        COALESCE(v.is_house, false) as is_house,
        COALESCE(vea.id, 0) as id,
        COALESCE(vea.event_id, $1) as event_id,
        COALESCE(e.title, 'Event #' || $1) as event_title,
        CASE WHEN v.is_house = TRUE THEN 0.0 ELSE COALESCE(vea.commission_rate, 10.0) END as commission_rate,
        COALESCE(vea.flat_fee, 0) as flat_fee,
        COALESCE(vea.settled_amount, 0) as settled_amount,
        COALESCE(vea.status, 'active') as status,
        COALESCE(sales_summary.total_sales, vea.total_sales, 0) as total_sales,
        COALESCE(sales_summary.order_count, 0) as order_count,
        COALESCE(sales_summary.cash_collected, 0) as cash_collected,
        COALESCE(sales_summary.mpesa_collected, 0) as mpesa_collected,
        COALESCE(sales_summary.tab_collected, 0) as tab_collected,
        (COALESCE(sales_summary.mpesa_collected, 0) + COALESCE(sales_summary.tab_collected, 0)) as digital_collected,
        CASE WHEN v.is_house = TRUE THEN 0.0 ELSE ROUND((COALESCE(sales_summary.total_sales, vea.total_sales, 0) * COALESCE(vea.commission_rate, 10.0) / 100.0), 2) END as commission_owed,
        CASE WHEN v.is_house = TRUE THEN COALESCE(sales_summary.total_sales, vea.total_sales, 0) ELSE ROUND(COALESCE(sales_summary.total_sales, vea.total_sales, 0) - (COALESCE(sales_summary.total_sales, vea.total_sales, 0) * COALESCE(vea.commission_rate, 10.0) / 100.0), 2) END as vendor_net_share,`;

if (!dbCode.includes(q1Old)) {
  console.error("q1Old not found in lib/supabase-db.ts");
  process.exit(1);
}
dbCode = dbCode.replace(q1Old, q1New);

// C. Update fetchSettlementsForEvent query 2 (all events)
const q2Old = `      v.contact_phone,
      v.logo_url,
      COALESCE(vea.id, 0) as id,
      COALESCE(vea.event_id, ps.event_id, 0) as event_id,
      COALESCE(e.title, 'Event #' || COALESCE(vea.event_id, ps.event_id, 0)) as event_title,
      COALESCE(vea.commission_rate, 10.0) as commission_rate,
      COALESCE(vea.flat_fee, 0) as flat_fee,
      COALESCE(vea.settled_amount, 0) as settled_amount,
      COALESCE(vea.status, 'active') as status,
      COALESCE(ps.total_sales, vea.total_sales, 0) as total_sales,
      COALESCE(ps.order_count, 0) as order_count,
      COALESCE(ps.cash_collected, 0) as cash_collected,
      COALESCE(ps.mpesa_collected, 0) as mpesa_collected,
      COALESCE(ps.tab_collected, 0) as tab_collected,
      (COALESCE(ps.mpesa_collected, 0) + COALESCE(ps.tab_collected, 0)) as digital_collected,
      ROUND((COALESCE(ps.total_sales, vea.total_sales, 0) * COALESCE(vea.commission_rate, 10.0) / 100.0), 2) as commission_owed,
      ROUND(COALESCE(ps.total_sales, vea.total_sales, 0) - (COALESCE(ps.total_sales, vea.total_sales, 0) * COALESCE(vea.commission_rate, 10.0) / 100.0), 2) as vendor_net_share,`;

const q2New = `      v.contact_phone,
      v.logo_url,
      COALESCE(v.is_house, false) as is_house,
      COALESCE(vea.id, 0) as id,
      COALESCE(vea.event_id, ps.event_id, 0) as event_id,
      COALESCE(e.title, 'Event #' || COALESCE(vea.event_id, ps.event_id, 0)) as event_title,
      CASE WHEN v.is_house = TRUE THEN 0.0 ELSE COALESCE(vea.commission_rate, 10.0) END as commission_rate,
      COALESCE(vea.flat_fee, 0) as flat_fee,
      COALESCE(vea.settled_amount, 0) as settled_amount,
      COALESCE(vea.status, 'active') as status,
      COALESCE(ps.total_sales, vea.total_sales, 0) as total_sales,
      COALESCE(ps.order_count, 0) as order_count,
      COALESCE(ps.cash_collected, 0) as cash_collected,
      COALESCE(ps.mpesa_collected, 0) as mpesa_collected,
      COALESCE(ps.tab_collected, 0) as tab_collected,
      (COALESCE(ps.mpesa_collected, 0) + COALESCE(ps.tab_collected, 0)) as digital_collected,
      CASE WHEN v.is_house = TRUE THEN 0.0 ELSE ROUND((COALESCE(ps.total_sales, vea.total_sales, 0) * COALESCE(vea.commission_rate, 10.0) / 100.0), 2) END as commission_owed,
      CASE WHEN v.is_house = TRUE THEN COALESCE(ps.total_sales, vea.total_sales, 0) ELSE ROUND(COALESCE(ps.total_sales, vea.total_sales, 0) - (COALESCE(ps.total_sales, vea.total_sales, 0) * COALESCE(vea.commission_rate, 10.0) / 100.0), 2) END as vendor_net_share,`;

if (!dbCode.includes(q2Old)) {
  console.error("q2Old not found in lib/supabase-db.ts");
  process.exit(1);
}
dbCode = dbCode.replace(q2Old, q2New);

if (isDbCRLF) dbCode = dbCode.replace(/\n/g, '\r\n');
fs.writeFileSync(dbFile, dbCode, 'utf8');
console.log("✓ Updated lib/supabase-db.ts");


// ==========================================
// 2. Update app/api/admin/vendors/[id]/analytics/route.ts
// ==========================================
const anFile = 'app/api/admin/vendors/[id]/analytics/route.ts';
let anRaw = fs.readFileSync(anFile, 'utf8');
const isAnCRLF = anRaw.includes('\r\n');
let anCode = isAnCRLF ? anRaw.replace(/\r\n/g, '\n') : anRaw;

// A. Include is_house in GET query
const anGetOld = `    const { rows: vendorRows } = await neonQuery(
      \`SELECT id, name, contact_name, contact_phone, logo_url, created_at
       FROM vendors
       WHERE id = $1 AND deleted_at IS NULL
       LIMIT 1\`,
      [vendorId]
    );`;

const anGetNew = `    const { rows: vendorRows } = await neonQuery(
      \`SELECT id, name, contact_name, contact_phone, logo_url, is_house, created_at
       FROM vendors
       WHERE id = $1 AND deleted_at IS NULL
       LIMIT 1\`,
      [vendorId]
    );`;

if (!anCode.includes(anGetOld)) {
  console.error("anGetOld not found in analytics route");
  process.exit(1);
}
anCode = anCode.replace(anGetOld, anGetNew);

// B. Include is_house in PATCH handler
const anPatchOld = `    const body = await request.json();
    const { contact_name, contact_phone, commission_rate, event_id } = body;

    if (contact_name !== undefined || contact_phone !== undefined) {
      await neonQuery(
        \`UPDATE vendors 
         SET contact_name = COALESCE($1, contact_name),
             contact_phone = COALESCE($2, contact_phone)
         WHERE id = $3\`,
        [contact_name, contact_phone, vendorId]
      );
    }`;

const anPatchNew = `    const body = await request.json();
    const { contact_name, contact_phone, commission_rate, event_id, is_house } = body;

    if (contact_name !== undefined || contact_phone !== undefined || is_house !== undefined) {
      await neonQuery(
        \`UPDATE vendors 
         SET contact_name = COALESCE($1, contact_name),
             contact_phone = COALESCE($2, contact_phone),
             is_house = COALESCE($3, is_house)
         WHERE id = $4\`,
        [contact_name, contact_phone, is_house !== undefined ? Boolean(is_house) : null, vendorId]
      );
    }`;

if (!anCode.includes(anPatchOld)) {
  console.error("anPatchOld not found in analytics route");
  process.exit(1);
}
anCode = anCode.replace(anPatchOld, anPatchNew);

if (isAnCRLF) anCode = anCode.replace(/\n/g, '\r\n');
fs.writeFileSync(anFile, anCode, 'utf8');
console.log("✓ Updated app/api/admin/vendors/[id]/analytics/route.ts");


// ==========================================
// 3. Update components/admin/VendorDetailDrawer.tsx
// ==========================================
const vdFile = 'components/admin/VendorDetailDrawer.tsx';
let vdRaw = fs.readFileSync(vdFile, 'utf8');
const isVdCRLF = vdRaw.includes('\r\n');
let vdCode = isVdCRLF ? vdRaw.replace(/\r\n/g, '\n') : vdRaw;

// A. Add is_house to vendorForm state
const vdFormStateOld = `  const [vendorForm, setVendorForm] = useState({
    contact_name: "",
    contact_phone: "",
    commission_rate: "10"
  });`;

const vdFormStateNew = `  const [vendorForm, setVendorForm] = useState({
    contact_name: "",
    contact_phone: "",
    commission_rate: "10",
    is_house: false
  });`;

if (!vdCode.includes(vdFormStateOld)) {
  console.error("vdFormStateOld not found in VendorDetailDrawer.tsx");
  process.exit(1);
}
vdCode = vdCode.replace(vdFormStateOld, vdFormStateNew);

// B. Load is_house into vendorForm in refreshData
const vdLoadOld = `            setVendorForm({
              contact_name: resData.vendor.contact_name || "",
              contact_phone: resData.vendor.contact_phone || "",
              commission_rate: String(resolvedComm ?? 10)
            });`;

const vdLoadNew = `            setVendorForm({
              contact_name: resData.vendor.contact_name || "",
              contact_phone: resData.vendor.contact_phone || "",
              commission_rate: String(resolvedComm ?? 10),
              is_house: Boolean(resData.vendor.is_house)
            });`;

if (!vdCode.includes(vdLoadOld)) {
  console.error("vdLoadOld not found in VendorDetailDrawer.tsx");
  process.exit(1);
}
vdCode = vdCode.replace(vdLoadOld, vdLoadNew);

// C. Pass is_house in handleSaveProfile
const vdSaveOld = `      const res = await fetch(\`/api/admin/vendors/\${vendorId}/analytics\`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_name: vendorForm.contact_name,
          contact_phone: vendorForm.contact_phone,
          commission_rate: commissionRate,
          event_id: eventId ? Number(eventId) : (data?.assignments?.[0]?.event_id || 2)
        })
      });`;

const vdSaveNew = `      const res = await fetch(\`/api/admin/vendors/\${vendorId}/analytics\`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_name: vendorForm.contact_name,
          contact_phone: vendorForm.contact_phone,
          commission_rate: vendorForm.is_house ? 0 : commissionRate,
          is_house: vendorForm.is_house,
          event_id: eventId ? Number(eventId) : (data?.assignments?.[0]?.event_id || 2)
        })
      });`;

if (!vdCode.includes(vdSaveOld)) {
  console.error("vdSaveOld not found in VendorDetailDrawer.tsx");
  process.exit(1);
}
vdCode = vdCode.replace(vdSaveOld, vdSaveNew);

// D. Add is_house checkbox in showEditVendorModal
const vdModalOld = `                <div>
                  <label className="text-[10px] font-black uppercase block mb-1">Commission Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={vendorForm.commission_rate}
                    onChange={(e) => setVendorForm({ ...vendorForm, commission_rate: e.target.value })}
                    placeholder="e.g. 10.0"
                    className="w-full border-2 border-[var(--brand-navy)] px-3 py-1.5 font-mono text-xs font-bold focus:outline-none bg-white"
                  />
                </div>`;

const vdModalNew = `                <div className="p-3 border-2 border-[var(--brand-navy)] bg-white space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={vendorForm.is_house}
                      onChange={(e) => {
                        const isH = e.target.checked;
                        setVendorForm({
                          ...vendorForm,
                          is_house: isH,
                          commission_rate: isH ? "0" : (vendorForm.commission_rate === "0" ? "10" : vendorForm.commission_rate)
                        });
                      }}
                      className="w-4 h-4 accent-brand-navy"
                    />
                    <span className="text-xs font-black uppercase text-brand-navy">
                      House / Event-Owned Stall
                    </span>
                  </label>
                  <p className="text-[10px] text-brand-navy/70 uppercase leading-snug">
                    For internal operations like Festival Kitchen, Main Bar, or Official Merch.
                    Commission is 0%, and 100% of sales are retained as festival revenue (no vendor payout required).
                  </p>
                </div>

                {!vendorForm.is_house && (
                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1">Commission Rate (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={vendorForm.commission_rate}
                      onChange={(e) => setVendorForm({ ...vendorForm, commission_rate: e.target.value })}
                      placeholder="e.g. 10.0"
                      className="w-full border-2 border-[var(--brand-navy)] px-3 py-1.5 font-mono text-xs font-bold focus:outline-none bg-white"
                    />
                  </div>
                )}`;

if (!vdCode.includes(vdModalOld)) {
  console.error("vdModalOld not found in VendorDetailDrawer.tsx");
  process.exit(1);
}
vdCode = vdCode.replace(vdModalOld, vdModalNew);

if (isVdCRLF) vdCode = vdCode.replace(/\n/g, '\r\n');
fs.writeFileSync(vdFile, vdCode, 'utf8');
console.log("✓ Updated components/admin/VendorDetailDrawer.tsx");

console.log("All patches ready!");
