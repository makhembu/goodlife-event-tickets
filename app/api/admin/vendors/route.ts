import { NextResponse } from 'next/server';
import { fetchAllVendors, createVendor, assignVendorToEvent, createOperator, fetchOperatorsForVendor, fetchActiveEvent } from '@/lib/supabase-db';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const vendors = await fetchAllVendors();
    // Attach operators for each vendor so the admin UI can view and manage their credentials.
    const vendorsWithOperators = await Promise.all(
      vendors.map(async (v) => {
        try {
          const ops = await fetchOperatorsForVendor(v.id);
          return {
            ...v,
            vendor_operators: ops,
          };
        } catch {
          return { ...v, vendor_operators: [] };
        }
      })
    );
    return NextResponse.json(vendorsWithOperators);
  } catch (err: any) {
    console.error('Error fetching vendors:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json().catch(() => ({}));
    const { name, contact_phone, contact_name, logo_url, eventId, flatFee, operator_name, operator_pin } = data;

    if (!name) {
      return NextResponse.json({ error: 'Missing vendor name' }, { status: 400 });
    }

    const commRate = parseFloat(String(data.commission_rate ?? data.commissionRate ?? 10)) || 10.0;

    const newVendor = await createVendor({
      name,
      contact_phone: contact_phone || '',
      contact_name: contact_name || '',
      logo_url: logo_url || ''
    });

    if (eventId) {
      await assignVendorToEvent(
        newVendor.id,
        Number(eventId),
        commRate,
        flatFee || 0
      );
    } else {
      const activeEvent = await fetchActiveEvent();
      if (activeEvent) {
        await assignVendorToEvent(
          newVendor.id,
          activeEvent.id,
          commRate,
          flatFee || 0
        );
      }
    }

    let operator = null;
    if (operator_name && operator_pin) {
      operator = await createOperator({
        vendor_id: newVendor.id,
        name: operator_name,
        pin: operator_pin,
        role: 'cashier'
      });
    }

    return NextResponse.json({
      success: true,
      vendor: newVendor,
      operator
    });
  } catch (err: any) {
    console.error('Error creating vendor:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
