import React from 'react';
import Link from 'next/link';

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  return (
    <div className="min-h-screen bg-brand-off-white font-mono text-brand-navy p-6 md:p-12 flex items-center justify-center">
      <div className="max-w-2xl text-center border-4 border-brand-navy bg-white p-12 shadow-(--shadow-brut-xl-strong)">
        <h1 className="font-display text-4xl uppercase mb-6">Goodlife Edition #{resolvedParams.id}</h1>
        <p className="mb-8 font-bold uppercase opacity-70">Event details and memories are being curated.</p>
        <Link href="/events" className="inline-block border-2 border-brand-navy bg-brand-accent px-6 py-3 font-bold uppercase hover:bg-brand-navy hover:text-brand-off-white transition-colors shadow-(--shadow-brut-sm)">
          Return to Archive
        </Link>
      </div>
    </div>
  );
}
