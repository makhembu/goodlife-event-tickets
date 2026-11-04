import React from "react";
import type { Metadata } from "next";
import LegalLayout from "@/components/legal/LegalLayout";
import { siteUrl } from "@/lib/seo";
import { AlertTriangle, CheckCircle2, QrCode, Ban, UserCheck, Camera } from "lucide-react";

export const metadata: Metadata = {
  title: {
    absolute: "Terms of Service & Admission | GOODLIFE Official Ticketing",
  },
  description:
    "Official Terms and Conditions for GOODLIFE event tickets and entry regulations at Marara Camp, Thika. 18+ age restrictions, gate scanning policy, and venue rules.",
  alternates: {
    canonical: `${siteUrl()}/terms`,
  },
};

export default function TermsPage() {
  return (
    <LegalLayout
      currentTab="terms"
      title="Terms of Service & Entry"
      subtitle="The binding rules governing ticket purchases, M-Pesa payments, and venue admission at Marara Camp, Thika."
    >
      {/* Essential rules banner */}
      <div className="bg-brand-accent/20 border-2 border-brand-navy p-4 font-mono text-xs text-brand-navy space-y-2">
        <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-sm">
          <AlertTriangle className="w-5 h-5 text-brand-navy shrink-0" />
          <span>Core Entry Requirements (Strictly Enforced)</span>
        </div>
        <p className="font-sans text-xs sm:text-sm">
          <strong>1. STRICTLY 18+:</strong> Original Kenyan National ID or Passport required at the gate. No digital photos or student cards.<br />
          <strong>2. NO OUTSIDE DRINKS:</strong> Outside alcohol, beverages, or cooler boxes are not permitted into Marara Camp.<br />
          <strong>3. ONE SCAN PER TICKET:</strong> Every digital pass is single-use. The first scan grants entry; duplicates are invalid.
        </p>
      </div>

      {/* Section 1 */}
      <section className="space-y-3">
        <h2 className="font-display text-2xl uppercase tracking-wider text-brand-navy border-b border-brand-navy/20 pb-1">
          1. Agreement to Terms
        </h2>
        <p className="font-sans text-sm text-brand-navy/90 leading-relaxed">
          By purchasing a ticket through our website, initiating an M-Pesa STK payment via PayHero, or presenting a digital pass at Marara Camp, 
          you agree to be bound by these Terms of Service, our Privacy Policy, and our Refund Policy. 
          If you are purchasing on behalf of a group or other attendees, you warrant that all guests comply with these rules.
        </p>
      </section>

      {/* Section 2 */}
      <section className="space-y-3">
        <h2 className="font-display text-2xl uppercase tracking-wider text-brand-navy border-b border-brand-navy/20 pb-1 flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-brand-navy" />
          2. Age Policy & Identity Verification (Strictly 18+)
        </h2>
        <p className="font-sans text-sm text-brand-navy/90 leading-relaxed">
          GOODLIFE festivals and club events are strictly adult experiences:
        </p>
        <ul className="list-disc pl-5 font-mono text-xs text-brand-navy/85 space-y-2">
          <li>All attendees must be 18 years of age or older on the date of the event.</li>
          <li>
            You must present a valid, original government-issued photo identification (Kenyan National ID, Alien Card, or International Passport) 
            prior to security entry.
          </li>
          <li>
            Photocopies, screenshots on mobile phones, driving licenses, and college/university IDs <strong>will not be accepted</strong> as proof of age.
          </li>
          <li>
            Individuals under 18 or failing to present original physical ID will be denied entry without any entitlement to a refund or exchange.
          </li>
        </ul>
      </section>

      {/* Section 3 */}
      <section className="space-y-3">
        <h2 className="font-display text-2xl uppercase tracking-wider text-brand-navy border-b border-brand-navy/20 pb-1 flex items-center gap-2">
          <QrCode className="w-5 h-5 text-brand-navy" />
          3. Digital Ticket Validity & Gate Scanner Policy
        </h2>
        <p className="font-sans text-sm text-brand-navy/90 leading-relaxed">
          Our events utilize a real-time, tamper-resistant gate scanning system:
        </p>
        <div className="border border-brand-navy bg-white/70 p-4 font-mono text-xs space-y-2.5">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-brand-navy shrink-0 mt-0.5" />
            <div>
              <strong>Single-Admit Rule:</strong> Each ticket carries a unique, single-use cryptographic QR code. 
              The first scan verified by our official gate scanner admits the holder into the venue.
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Ban className="w-4 h-4 text-brand-navy shrink-0 mt-0.5" />
            <div>
              <strong>No Duplicate Passes:</strong> Any subsequent scan of an already-admitted QR code will trigger a &ldquo;Ticket Already Admitted&rdquo; red alert at the scanner. 
              GOODLIFE is not responsible for tickets shared, forwarded, or compromised by the purchaser. Keep your QR code secure.
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-brand-navy shrink-0 mt-0.5" />
            <div>
              <strong>Wristband Issuance:</strong> Upon successful QR scan, attendees receive a tamper-evident wristband. 
              Wristbands must be worn securely at all times within the grounds. Broken, removed, or transferred wristbands are void.
            </div>
          </div>
        </div>
      </section>

      {/* Section 4 */}
      <section className="space-y-3">
        <h2 className="font-display text-2xl uppercase tracking-wider text-brand-navy border-b border-brand-navy/20 pb-1 flex items-center gap-2">
          <Ban className="w-5 h-5 text-brand-navy" />
          4. Venue Regulations & Prohibited Items (Marara Camp, Thika)
        </h2>
        <p className="font-sans text-sm text-brand-navy/90 leading-relaxed">
          To maintain a safe, premium festival atmosphere for all guests, the following venue rules apply without exception:
        </p>
        <ul className="list-disc pl-5 font-mono text-xs text-brand-navy/85 space-y-1.5">
          <li><strong>No Outside Drinks or Food:</strong> Fully stocked bars and accredited food vendors operate inside the event grounds. Outside alcoholic beverages, sodas, and cooler boxes will be confiscated at security.</li>
          <li><strong>Mandatory Security Checks:</strong> Security personnel conduct body frisks, metal detector scans, and vehicle/bag inspections at the main entrance.</li>
          <li><strong>Banned Items:</strong> Weapons of any kind, sharp objects, fireworks, flammable liquids, and illicit narcotics are strictly banned. Offenders will be handed over to local law enforcement.</li>
          <li><strong>Right of Admission Reserved:</strong> Management reserves the right to refuse entry or eject any individual exhibiting abusive, aggressive, overly intoxicated, or hazardous behavior without a refund.</li>
        </ul>
      </section>

      {/* Section 5 */}
      <section className="space-y-3">
        <h2 className="font-display text-2xl uppercase tracking-wider text-brand-navy border-b border-brand-navy/20 pb-1 flex items-center gap-2">
          <Camera className="w-5 h-5 text-brand-navy" />
          5. Media, Filming & Photography Consent
        </h2>
        <p className="font-sans text-sm text-brand-navy/90 leading-relaxed">
          GOODLIFE events are documented by professional media crews. By entering Marara Camp, you acknowledge and agree that your voice, image, 
          and likeness may be recorded via photography, drone videography, and audio recording. You grant GOODLIFE, SMWHR INC, 
          and its partners the royalty-free, perpetual right to utilize this media in event recaps, social media broadcasts, and promotional advertising.
        </p>
      </section>

      {/* Section 6 */}
      <section className="space-y-3">
        <h2 className="font-display text-2xl uppercase tracking-wider text-brand-navy border-b border-brand-navy/20 pb-1">
          6. Limitation of Liability
        </h2>
        <p className="font-sans text-sm text-brand-navy/90 leading-relaxed">
          Attendees enter Marara Camp at their own risk. While we implement strict professional security, first aid, and crowd management protocols, 
          GOODLIFE, venue proprietors, and associated organizers shall not be liable for any personal injury, loss, or theft of personal property 
          occurring on the premises or in designated parking zones. Please look after your personal belongings.
        </p>
      </section>
    </LegalLayout>
  );
}
