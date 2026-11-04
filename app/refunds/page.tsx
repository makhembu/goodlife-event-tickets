import React from "react";
import type { Metadata } from "next";
import LegalLayout from "@/components/legal/LegalLayout";
import { siteUrl } from "@/lib/seo";
import { RefreshCw, CheckCircle2, AlertOctagon, HelpCircle, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: {
    absolute: "Refund & Cancellation Policy | GOODLIFE Official Ticketing",
  },
  description:
    "Official Refund, Cancellation, and Postponement Policy for GOODLIFE event tickets. Learn our policies for cancelled events, weather delays, and failed PayHero M-Pesa STK transactions.",
  alternates: {
    canonical: `${siteUrl()}/refunds`,
  },
};

export default function RefundsPage() {
  return (
    <LegalLayout
      currentTab="refunds"
      title="Refund & Cancellation Policy"
      subtitle="Clear guidelines on ticket refunds, event postponements, and resolving PayHero M-Pesa transactions."
    >
      {/* Quick summary callout */}
      <div className="bg-brand-accent/15 border-2 border-brand-navy p-4 font-mono text-xs text-brand-navy space-y-2">
        <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-sm">
          <RefreshCw className="w-5 h-5 text-brand-navy shrink-0" />
          <span>General Refund Policy: Final Sale (With Explicit Exceptions)</span>
        </div>
        <p className="font-sans text-xs sm:text-sm">
          Due to the nature of live event operations and capacity limitations, all ticket sales are <strong>final and non-refundable</strong> once successfully issued, 
          except in the direct instance of an event cancellation by the organizers or unresolved duplicate payment errors.
        </p>
      </div>

      {/* Section 1 */}
      <section className="space-y-3">
        <h2 className="font-display text-2xl uppercase tracking-wider text-brand-navy border-b border-brand-navy/20 pb-1">
          1. General Ticket Purchase Terms
        </h2>
        <p className="font-sans text-sm text-brand-navy/90 leading-relaxed">
          When you complete a purchase through PayHero M-Pesa STK push or our manual till, your ticket reservation is immediately locked into our database. 
          Refunds are <strong>not provided</strong> under the following circumstances:
        </p>
        <ul className="list-disc pl-5 font-mono text-xs text-brand-navy/85 space-y-1.5">
          <li>Change of personal plans, work conflicts, or failure to travel to Marara Camp, Thika.</li>
          <li>Refusal of entry at the gate due to inability to present valid physical 18+ original photo ID.</li>
          <li>Refusal of entry or ejection resulting from violation of venue rules, carrying outside drinks, or disorderly conduct.</li>
          <li>Inclement weather conditions (such as rain or cold), as GOODLIFE events proceed rain or shine with covered structures.</li>
        </ul>
      </section>

      {/* Section 2 */}
      <section className="space-y-3">
        <h2 className="font-display text-2xl uppercase tracking-wider text-brand-navy border-b border-brand-navy/20 pb-1 flex items-center gap-2">
          <AlertOctagon className="w-5 h-5 text-brand-navy" />
          2. Event Cancellation by Organizers
        </h2>
        <p className="font-sans text-sm text-brand-navy/90 leading-relaxed">
          If GOODLIFE or SMWHR INC officially cancels an event in its entirety without a replacement or rescheduled date:
        </p>
        <div className="border border-brand-navy bg-white/70 p-4 font-mono text-xs space-y-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-brand-navy shrink-0 mt-0.5" />
            <div>
              <strong>100% Face Value Refund:</strong> All ticket purchasers will receive a full refund of the ticket face value.
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-brand-navy shrink-0 mt-0.5" />
            <div>
              <strong>Automatic M-Pesa Reversal:</strong> Refunds will be issued directly back to the Safaricom M-Pesa mobile number utilized during checkout via our payment processor within 10 to 14 business days.
            </div>
          </div>
        </div>
      </section>

      {/* Section 3 */}
      <section className="space-y-3">
        <h2 className="font-display text-2xl uppercase tracking-wider text-brand-navy border-b border-brand-navy/20 pb-1">
          3. Event Postponement or Venue Relocation
        </h2>
        <p className="font-sans text-sm text-brand-navy/90 leading-relaxed">
          If an event is postponed, rescheduled, or relocated due to statutory directives, weather, security warnings, or force majeure:
        </p>
        <ul className="list-disc pl-5 font-mono text-xs text-brand-navy/85 space-y-2">
          <li>
            <strong>Automatic Ticket Validity:</strong> All existing issued tickets will remain 100% valid for the new rescheduled date. You do not need to generate a new QR pass.
          </li>
          <li>
            <strong>Ticket Rollover or Credit:</strong> If you are unable to attend the rescheduled date, you may submit a request within seven (7) days of the postponement announcement to rollover your ticket credit toward any upcoming GOODLIFE event within 12 months.
          </li>
        </ul>
      </section>

      {/* Section 4 */}
      <section className="space-y-3">
        <h2 className="font-display text-2xl uppercase tracking-wider text-brand-navy border-b border-brand-navy/20 pb-1 flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-brand-navy" />
          4. PayHero M-Pesa Payment Resolution (Failed STK / Network Timeouts)
        </h2>
        <p className="font-sans text-sm text-brand-navy/90 leading-relaxed">
          Occasionally, mobile network latency between Safaricom M-Pesa, PayHero, and our server can cause an STK prompt to succeed on your handset while the web screen displays a timeout:
        </p>
        <div className="border-2 border-brand-navy bg-brand-off-white p-4 font-mono text-xs space-y-3">
          <div className="font-bold text-brand-navy uppercase tracking-wider flex items-center gap-1.5 text-xs">
            <ArrowRight className="w-4 h-4 text-brand-navy" />
            What to do if money was debited but your ticket hasn&rsquo;t displayed:
          </div>
          <ol className="list-decimal pl-5 space-y-1.5 text-brand-navy/90">
            <li><strong>DO NOT SUBMIT A SECOND PAYMENT:</strong> Multiple attempts may result in duplicate debits.</li>
            <li><strong>Check WhatsApp & SMS:</strong> Our automated PayHero webhook callback automatically generates your ticket in the background and sends the PDF pass to your WhatsApp. Please allow up to 5 minutes.</li>
            <li>
              <strong>Instant Support Help:</strong> If you have not received your ticket after 10 minutes, send your M-Pesa Confirmation SMS (e.g. <em>&ldquo;QK12345678 Confirmed. Ksh...&rdquo;</em>) 
              along with your mobile number to our WhatsApp support line at <strong>+254 700 000 000</strong> or email <strong>support@goodlife.smwhr.space</strong>. 
              Our ticketing desk will instantly verify the PayHero transaction reference and dispatch your ticket immediately.
            </li>
          </ol>
        </div>
      </section>

      {/* Section 5 */}
      <section className="space-y-3">
        <h2 className="font-display text-2xl uppercase tracking-wider text-brand-navy border-b border-brand-navy/20 pb-1">
          5. Ticket Transfers & Resale
        </h2>
        <p className="font-sans text-sm text-brand-navy/90 leading-relaxed">
          If you are unable to attend, you may freely transfer your ticket to a friend or relative. Simply share the digital PDF or WhatsApp ticket containing the QR code with them. 
          Please note:
        </p>
        <ul className="list-disc pl-5 font-mono text-xs text-brand-navy/85 space-y-1.5">
          <li>The recipient must be strictly 18 years or older with original government ID.</li>
          <li>Our gate scanner operates on an <strong>atomic admission principle</strong> — whoever presents the valid QR code first is admitted. Once scanned, the QR code cannot be used again.</li>
          <li>GOODLIFE is not liable for unauthorized resale, third-party scalping, or fraudulent ticket exchanges outside of official channels.</li>
        </ul>
      </section>
    </LegalLayout>
  );
}
