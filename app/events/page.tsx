import React from 'react';
import Link from 'next/link';
import { Calendar, ArrowRight } from 'lucide-react';
import { getDbPool } from '@/lib/neon-client';

// Render on demand. Without this the archive is prerendered at build time, which
// both makes `next build` depend on Neon being reachable AND freezes the event
// list until the next deploy - so a newly created event would not appear.
export const dynamic = "force-dynamic";

async function fetchAllEvents() {
  const db = getDbPool();
  const { rows } = await db.query(`SELECT id, title, status, event_date, venue FROM events ORDER BY event_date DESC`);
  return rows;
}

export default async function EventsArchivePage() {
  // Now rendered per request, so a database outage would surface here as a 500
  // rather than as a failed build. Degrade to a message instead: the archive is
  // a public page and "temporarily unavailable" beats a stack trace.
  let events: Array<{ id: number; title: string; status: string; event_date: string | null; venue: string }> = [];
  let unavailable = false;
  try {
    events = await fetchAllEvents();
  } catch (err) {
    console.error("Events archive: database unavailable", err);
    unavailable = true;
  }

  return (
    <div className="min-h-screen bg-brand-off-white font-mono text-brand-navy p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-12">
        <header className="border-b-8 border-brand-navy pb-8">
          <Link href="/" className="inline-block border-2 border-brand-navy bg-brand-accent px-4 py-2 font-bold uppercase hover:bg-brand-navy hover:text-brand-off-white transition-colors mb-8 shadow-(--shadow-brut-sm)">
            &larr; Back to Frontpage
          </Link>
          <h1 className="font-display text-5xl md:text-7xl uppercase tracking-wider">The Archive</h1>
          <p className="text-xl opacity-80 mt-4 uppercase font-bold tracking-widest">Past & Future Goodlife Editions</p>
        </header>

        <div className="grid grid-cols-1 gap-8">
          {events.map((evt) => (
            <Link key={evt.id} href={`/events/${evt.id}`} className="group block">
              <div className="border-4 border-brand-navy bg-white shadow-(--shadow-brut-xl-soft) hover:shadow-(--shadow-brut-sm) hover:translate-x-1 hover:translate-y-1 transition-all overflow-hidden flex flex-col md:flex-row">
                <div className="bg-brand-navy text-brand-off-white p-6 md:w-48 flex flex-col justify-center items-center text-center">
                  <Calendar className="w-12 h-12 text-brand-accent mb-4 group-hover:scale-110 transition-transform" />
                  <div className="font-bold uppercase text-sm">{evt.event_date ? new Date(evt.event_date).toLocaleDateString() : 'TBA'}</div>
                </div>
                <div className="p-6 md:p-8 flex-1 flex flex-col justify-center">
                  <div className="flex justify-between items-start mb-2">
                    <h2 className="font-display text-3xl uppercase">{evt.title}</h2>
                    <span className="bg-brand-accent text-brand-navy text-xs font-bold px-3 py-1 uppercase border-2 border-brand-navy">
                      {evt.status}
                    </span>
                  </div>
                  <p className="text-sm uppercase font-bold opacity-70 flex items-center gap-2">
                    {evt.venue}
                  </p>
                </div>
                <div className="bg-brand-accent p-6 md:w-24 flex items-center justify-center border-t-4 md:border-t-0 md:border-l-4 border-brand-navy group-hover:bg-brand-navy group-hover:text-brand-off-white transition-colors">
                  <ArrowRight className="w-8 h-8" />
                </div>
              </div>
            </Link>
          ))}
          {events.length === 0 && (
            <div className="p-12 text-center border-4 border-brand-navy bg-white font-bold uppercase text-xl">
              {unavailable
                ? 'The archive is temporarily unavailable. Please try again shortly.'
                : 'No events found in the archive.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
