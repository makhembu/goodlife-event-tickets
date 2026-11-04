import React from "react";
import type { Metadata } from "next";
import LegalLayout from "@/components/legal/LegalLayout";
import { siteUrl } from "@/lib/seo";
import { ShieldCheck, Lock, Smartphone, Database, Bell, EyeOff } from "lucide-react";

export const metadata: Metadata = {
  title: {
    absolute: "Privacy Policy | GOODLIFE Official Ticketing",
  },
  description:
    "Official Privacy Policy for GOODLIFE ticketing. Learn how we handle your M-Pesa payments via PayHero, WhatsApp ticket delivery, and personal data under the Kenya Data Protection Act, 2019.",
  alternates: {
    canonical: `${siteUrl()}/privacy`,
  },
};

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout
      currentTab="privacy"
      title="Privacy Policy"
      subtitle="How GOODLIFE collects, protects, and handles your data when purchasing tickets and attending our events."
    >
      {/* Overview callout banner */}
      <div className="bg-brand-accent/15 border-2 border-brand-navy p-4 font-mono text-xs text-brand-navy space-y-2">
        <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-sm">
          <ShieldCheck className="w-5 h-5 text-brand-navy shrink-0" />
          <span>Commitment to Your Privacy & M-Pesa Security</span>
        </div>
        <p>
          GOODLIFE (operated by SMWHR INC) respects your privacy and complies with the <strong>Kenya Data Protection Act, 2019</strong>. 
          When you purchase a ticket using our M-Pesa payment integration powered by <strong>PayHero Kenya</strong>, 
          we only process information necessary to issue your ticket, confirm payment, deliver your pass via WhatsApp/SMS, and admit you securely at Marara Camp.
        </p>
      </div>

      {/* Section 1 */}
      <section className="space-y-3">
        <h2 className="font-display text-2xl uppercase tracking-wider text-brand-navy border-b border-brand-navy/20 pb-1">
          1. Data We Collect
        </h2>
        <p className="font-sans text-sm text-brand-navy/90 leading-relaxed">
          When you interact with the GOODLIFE platform, initiate an M-Pesa checkout, or enter our venue, we collect the following categories of information:
        </p>
        <ul className="list-disc pl-5 font-mono text-xs text-brand-navy/85 space-y-2">
          <li>
            <strong>Contact & Identity Details:</strong> Attendee name (for the ticket pass and age verification) and your Safaricom/Airtel mobile telephone number.
          </li>
          <li>
            <strong>Payment & Transaction Records:</strong> External transaction reference code, checkout request ID, PayHero transaction ID, M-Pesa receipt number, date/time of payment, and the ticket tier purchased.
          </li>
          <li>
            <strong>Admission & Gate Verification Logs:</strong> Digital ticket QR scan timestamp, scanning gate terminal ID, and entry status (to enforce our single-admission anti-counterfeit policy).
          </li>
          <li>
            <strong>Technical & Session Data:</strong> Browser user agent, device screen category, IP address, and essential security cookies necessary for secure checkout and vendor point-of-sale operations.
          </li>
        </ul>
      </section>

      {/* Section 2 */}
      <section className="space-y-3">
        <h2 className="font-display text-2xl uppercase tracking-wider text-brand-navy border-b border-brand-navy/20 pb-1 flex items-center gap-2">
          <EyeOff className="w-5 h-5 text-brand-navy" />
          2. Payment Processing & PayHero M-Pesa Security
        </h2>
        <p className="font-sans text-sm text-brand-navy/90 leading-relaxed">
          Your payment security is paramount. We process mobile money transactions through <strong>PayHero Kenya</strong>, 
          an authorized payment gateway integrated with <strong>Safaricom PLC (Daraja API)</strong>:
        </p>
        <div className="border-l-4 border-brand-navy bg-white/70 p-4 font-mono text-xs space-y-2">
          <p className="font-bold text-brand-navy">
            WE NEVER SOLICIT, STORE, ACCESS, OR TRANSMIT YOUR SECRET M-PESA PIN OR BANKING PASSWORDS.
          </p>
          <p className="text-brand-navy/80">
            When you enter your phone number and tap &ldquo;PAY WITH M-PESA&rdquo;, an automated STK Push prompt is sent by Safaricom 
            directly to your handset. You enter your PIN exclusively into Safaricom&rsquo;s encrypted SIM toolkit dialogue. 
            GOODLIFE only receives a cryptographic callback verifying whether the transaction succeeded or failed.
          </p>
        </div>
      </section>

      {/* Section 3 */}
      <section className="space-y-3">
        <h2 className="font-display text-2xl uppercase tracking-wider text-brand-navy border-b border-brand-navy/20 pb-1">
          3. How We Use Your Information
        </h2>
        <p className="font-sans text-sm text-brand-navy/90 leading-relaxed">
          We process personal data strictly under lawful bases, including contract fulfillment, legal compliance, and legitimate operational interests:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="border border-brand-navy p-3 bg-brand-off-white">
            <div className="flex items-center gap-2 font-display text-base uppercase text-brand-navy mb-1">
              <Smartphone className="w-4 h-4" />
              Ticket Delivery
            </div>
            <p className="font-mono text-xs text-brand-navy/80">
              Dispatching your personalized digital QR ticket directly to your WhatsApp and SMS upon verified PayHero payment.
            </p>
          </div>

          <div className="border border-brand-navy p-3 bg-brand-off-white">
            <div className="flex items-center gap-2 font-display text-base uppercase text-brand-navy mb-1">
              <ShieldCheck className="w-4 h-4" />
              Gate Admittance
            </div>
            <p className="font-mono text-xs text-brand-navy/80">
              Validating unique QR passes at Marara Camp via our Gate Scanner PWA to prevent counterfeit passes and enforce single-admit rules.
            </p>
          </div>

          <div className="border border-brand-navy p-3 bg-brand-off-white">
            <div className="flex items-center gap-2 font-display text-base uppercase text-brand-navy mb-1">
              <Bell className="w-4 h-4" />
              Operational Updates
            </div>
            <p className="font-mono text-xs text-brand-navy/80">
              Notifying you of urgent event schedule adjustments, gate opening times, venue parking instructions, or severe weather notices.
            </p>
          </div>

          <div className="border border-brand-navy p-3 bg-brand-off-white">
            <div className="flex items-center gap-2 font-display text-base uppercase text-brand-navy mb-1">
              <Database className="w-4 h-4" />
              Audit & Accounting
            </div>
            <p className="font-mono text-xs text-brand-navy/80">
              Reconciling vendor settlements, M-Pesa till audits, and statutory tax and financial reporting requirements in Kenya.
            </p>
          </div>
        </div>
      </section>

      {/* Section 4 */}
      <section className="space-y-3">
        <h2 className="font-display text-2xl uppercase tracking-wider text-brand-navy border-b border-brand-navy/20 pb-1">
          4. Third-Party Service Providers
        </h2>
        <p className="font-sans text-sm text-brand-navy/90 leading-relaxed">
          We do not sell, rent, or trade your personal data. We only share information with trusted third-party technical infrastructure providers required to operate our service:
        </p>
        <ul className="list-disc pl-5 font-mono text-xs text-brand-navy/85 space-y-1.5">
          <li><strong>PayHero Kenya & Safaricom PLC:</strong> Payment authorization, STK push collection, and settlement verification.</li>
          <li><strong>WhatsApp Business API / WAHA Gateway:</strong> Automated transmission of ticket confirmation and QR codes.</li>
          <li><strong>Cloud Database (Neon Postgres):</strong> Encrypted database storage for ticket validation and transaction logs.</li>
          <li><strong>Paystack (where enabled):</strong> Supplementary debit/credit card processing under global PCI-DSS Level 1 compliance.</li>
        </ul>
      </section>

      {/* Section 5 */}
      <section className="space-y-3">
        <h2 className="font-display text-2xl uppercase tracking-wider text-brand-navy border-b border-brand-navy/20 pb-1">
          5. Data Retention & Security Measures
        </h2>
        <p className="font-sans text-sm text-brand-navy/90 leading-relaxed">
          We apply robust administrative and technical security measures. All communications between your device, PayHero, and our database are encrypted using TLS 1.3 / SSL. 
          Gate scanner cookies and session tokens are cryptographically signed using HMAC-SHA256. 
          Transaction records are retained for financial reporting and anti-fraud audit periods as mandated by Kenyan accounting laws.
        </p>
      </section>

      {/* Section 6 */}
      <section className="space-y-3">
        <h2 className="font-display text-2xl uppercase tracking-wider text-brand-navy border-b border-brand-navy/20 pb-1">
          6. Your Rights Under the Kenya Data Protection Act
        </h2>
        <p className="font-sans text-sm text-brand-navy/90 leading-relaxed">
          In accordance with the <strong>Kenya Data Protection Act, 2019</strong>, you possess the right to:
        </p>
        <ul className="list-disc pl-5 font-mono text-xs text-brand-navy/85 space-y-1">
          <li>Be informed of how your personal data is collected and processed.</li>
          <li>Request access to the personal data we hold regarding your tickets or transactions.</li>
          <li>Request correction of inaccurate or incomplete details.</li>
          <li>Request deletion or erasure of personal records, subject to statutory retention obligations for financial audit.</li>
        </ul>
        <p className="font-mono text-xs text-brand-navy/80 pt-2">
          To exercise any of these rights, please contact our Data Controller at <strong>support@goodlife.smwhr.space</strong>.
        </p>
      </section>
    </LegalLayout>
  );
}
