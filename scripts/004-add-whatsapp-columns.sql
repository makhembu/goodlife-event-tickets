-- Add WhatsApp message template to event_details
ALTER TABLE event_details ADD COLUMN IF NOT EXISTS whatsapp_message TEXT DEFAULT '';

-- Add WhatsApp number to pending_payments
ALTER TABLE pending_payments ADD COLUMN IF NOT EXISTS whatsapp_number TEXT DEFAULT '';
