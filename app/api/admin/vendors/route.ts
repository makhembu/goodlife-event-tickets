import { NextResponse } from 'next/server';
import { fetchAllVendors, createVendor, assignVendorToEvent, createOperator } from '@/lib/supabase-db';

export async function GET() {
  try {
    const vendors = await fetchAllVendors();
    return NextResponse.json(vendors);
  } catch (err: any) {
    console.error('Error fetching vendors:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json().catch(() => ({}));
    const { name, contact_phone, contact_name, logo_url, eventId, commissionRate, flatFee, operator_name, operator_pin } = data;

    if (!name) {
      return NextResponse.json({ error: 'Missing vendor name' }, { status: 400 });
    }

    const newVendor = await createVendor({
      name,
      contact_phone: contact_phone || '',
      contact_name: contact_name || '',
      logo_url: logo_url || ''
    });

    if (eventId) {
      await assignVendorToEvent(
        newVendor.id,
        eventId,
        commissionRate || 0,
        flatFee || 0
      );
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
      vendor: newVendor,
      operator
    });
  } catch (err: any) {
    console.error('Error creating vendor:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
