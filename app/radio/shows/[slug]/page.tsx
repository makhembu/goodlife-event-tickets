import type { Metadata } from "next";
import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { neonQuery } from "@/lib/supabase-db";
import { SITE_NAME, TWITTER_HANDLE, siteUrl } from "@/lib/seo";
import CatchUpVault from "@/components/radio/CatchUpVault";
import ShowReminderButton from "@/components/radio/ShowReminderButton";
import { ArrowLeft, Clock, Calendar, CalendarPlus, Radio, Disc3, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const res = await neonQuery(
    `SELECT title, description, genre FROM shows WHERE slug = $1 LIMIT 1;`,
    [slug]
  );
  if (!res.rows || res.rows.length === 0) return {};
  const show = res.rows[0];
  const baseUrl = siteUrl();
  const pageUrl = `${baseUrl}/radio/shows/${slug}`;
  const title = `${show.title} | GOODLIFE Radio 254`;
  const description = show.description || `Listen to ${show.title} on GOODLIFE Radio 254.`;
  const ogImageUrl = `${baseUrl}/api/og/radio?show=${encodeURIComponent(slug)}`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: "website",
      title,
      description,
      url: pageUrl,
      siteName: SITE_NAME,
      locale: "en_KE",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${show.title} on GOODLIFE Radio 254`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      site: TWITTER_HANDLE,
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function ShowDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const showRes = await neonQuery(
    `SELECT s.*, p.dj_name, p.slug as presenter_slug, p.bio as presenter_bio, p.avatar_url as presenter_avatar
     FROM shows s
     JOIN presenters p ON p.id = s.primary_presenter_id
     WHERE s.slug = $1 LIMIT 1;`,
    [slug]
  );

  if (!showRes.rows || showRes.rows.length === 0) {
    notFound();
  }

  const show = showRes.rows[0];

  // Fetch upcoming slots
  const slotsRes = await neonQuery(
    `SELECT id, starts_at, ends_at, status
     FROM show_slots
     WHERE show_id = $1 AND ends_at > NOW() AND status != 'cancelled'
     ORDER BY starts_at ASC
     LIMIT 5;`,
    [show.id]
  );
  const upcomingSlots = slotsRes.rows || [];

  // Fetch past episodes / archived recordings
  const recordingsRes = await neonQuery(
    `SELECT id, title, audio_url, duration, recorded_at
     FROM radio_recordings
     WHERE show_id = $1 AND is_public = true
     ORDER BY recorded_at DESC
     LIMIT 6;`,
    [show.id]
  ).catch(() => ({ rows: [] }));
  const recordings = recordingsRes.rows || [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RadioSeries",
    name: show.title,
    description: show.description,
    genre: show.genre,
    url: `${siteUrl()}/radio/shows/${show.slug}`,
    publisher: {
      "@type": "RadioStation",
      name: "GOODLIFE Radio 254",
      url: siteUrl(),
    },
    creator: {
      "@type": "Person",
      name: show.dj_name,
      url: `${siteUrl()}/radio/presenters/${show.presenter_slug}`,
    },
  };

  return (
    <div className="min-h-screen bg-brand-off-white text-brand-navy font-mono pb-24 selection:bg-brand-accent selection:text-brand-navy">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="border-b-4 border-brand-navy bg-brand-navy text-brand-off-white px-4 py-4 sm:px-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link
            href="/radio/schedule"
            className="flex items-center gap-2 text-xs font-bold uppercase text-brand-accent hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Timetable
          </Link>
          <Link
            href="/radio"
            className="px-3 py-1 bg-brand-accent text-brand-navy font-black text-xs uppercase border border-brand-navy shadow-sm hover:bg-white transition-all flex items-center gap-1.5"
          >
            <Radio className="w-3.5 h-3.5" /> Listen Live
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 sm:px-8 space-y-8">
        {/* Show Hero Card */}
        <div className="border-4 border-brand-navy bg-white shadow-[6px_6px_0px_#142B4C] p-6 sm:p-8 flex flex-col md:flex-row gap-6 items-start">
          <div className="w-full md:w-56 h-56 bg-brand-navy shrink-0 border-3 border-brand-navy overflow-hidden">
            {show.cover_image_url ? (
              <img
                src={show.cover_image_url}
                alt={show.title}
                className="w-full h-full object-cover"
              />
            ) : show.presenter_avatar ? (
              <img
                src={show.presenter_avatar}
                alt={show.dj_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-brand-navy text-brand-accent font-display text-6xl font-black">
                {show.title.slice(0, 1)}
              </div>
            )}
          </div>

          <div className="flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-brand-accent text-brand-navy text-xs font-black uppercase px-2.5 py-1 border border-brand-navy">
                {show.genre || "Afrobeats"}
              </span>
              <span className="bg-neutral-100 text-neutral-800 text-xs font-bold uppercase px-2.5 py-1 border border-neutral-300">
                {show.recurrence_pattern === "weekly"
                  ? `Weekly · ${Array.isArray(show.recurrence_days) ? show.recurrence_days.join(", ") : "Fridays"}`
                  : show.recurrence_pattern}
              </span>
            </div>

            <h1 className="font-display text-3xl sm:text-5xl font-black uppercase tracking-tight text-brand-navy leading-none">
              {show.title}
            </h1>

            <p className="text-sm sm:text-base text-neutral-800 font-sans leading-relaxed">
              {show.description || "Tune in live on GOODLIFE Radio 254."}
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-4 border-t-2 border-brand-navy/10">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase text-neutral-500">Host:</span>
                <Link
                  href={`/radio/presenters/${show.presenter_slug}`}
                  className="font-bold underline text-brand-navy hover:text-brand-accent"
                >
                  {show.dj_name}
                </Link>
              </div>

              <ShowReminderButton showId={show.id} showTitle={show.title} />

              <a
                href={`/api/radio/shows/${show.slug}/calendar.ics`}
                download
                className="text-xs font-bold uppercase bg-brand-navy text-brand-off-white hover:bg-brand-accent hover:text-brand-navy px-3 py-1.5 border-2 border-brand-navy transition-colors flex items-center gap-1.5 ml-auto"
              >
                <CalendarPlus className="w-4 h-4" /> Subscribe via .ICS
              </a>
            </div>
          </div>
        </div>

        {/* Two-Column Grid: Upcoming Slots & Host Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Upcoming Air Dates */}
          <div className="border-3 border-brand-navy bg-white p-6 shadow-[4px_4px_0px_#142B4C]">
            <h2 className="font-display text-xl uppercase tracking-wide text-brand-navy border-b-2 border-brand-navy pb-2 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-brand-accent" /> Upcoming Air Dates
            </h2>

            {upcomingSlots.length === 0 ? (
              <p className="text-xs text-neutral-500 py-4">No upcoming air dates scheduled.</p>
            ) : (
              <ul className="divide-y divide-brand-navy/10 font-mono text-xs">
                {upcomingSlots.map((slot: any) => {
                  const d = new Date(slot.starts_at);
                  const end = new Date(slot.ends_at);
                  const dateStr = d.toLocaleDateString([], {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    timeZone: "Africa/Nairobi",
                  });
                  const timeStr = `${d.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Africa/Nairobi",
                  })} – ${end.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Africa/Nairobi",
                  })} EAT`;

                  return (
                    <li key={slot.id} className="py-2.5 flex items-center justify-between">
                      <span className="font-bold">{dateStr}</span>
                      <span className="text-neutral-600">{timeStr}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Host Card */}
          <div className="border-3 border-brand-navy bg-white p-6 shadow-[4px_4px_0px_#142B4C]">
            <h2 className="font-display text-xl uppercase tracking-wide text-brand-navy border-b-2 border-brand-navy pb-2 mb-4">
              About the Host
            </h2>

            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-full border-2 border-brand-navy bg-brand-navy/10 overflow-hidden shrink-0">
                {show.presenter_avatar ? (
                  <img
                    src={show.presenter_avatar}
                    alt={show.dj_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-display text-xl font-black">
                    {show.dj_name.slice(0, 1)}
                  </div>
                )}
              </div>
              <div>
                <h3 className="font-display text-xl font-black uppercase text-brand-navy">
                  {show.dj_name}
                </h3>
                <Link
                  href={`/radio/presenters/${show.presenter_slug}`}
                  className="text-xs font-bold text-brand-accent underline hover:text-brand-navy"
                >
                  View Profile & Past Shows
                </Link>
              </div>
            </div>

            <p className="text-xs text-neutral-700 font-sans leading-relaxed">
              {show.presenter_bio || "Resident presenter on GOODLIFE Radio 254."}
            </p>
          </div>
        </div>

        {/* Catch Up Vault (Public Approved Recordings) */}
        <CatchUpVault showSlug={slug} title={`CATCH UP · ${show.title}`} />

        {/* Past Episodes / Legacy Audio fallback if any */}
        {recordings.length > 0 && (
          <div className="border-3 border-brand-navy bg-white p-6 shadow-[4px_4px_0px_#142B4C]">
            <h2 className="font-display text-xl uppercase tracking-wide text-brand-navy border-b-2 border-brand-navy pb-2 mb-4 flex items-center gap-2">
              <Disc3 className="w-5 h-5 text-brand-accent" /> Past Live Recordings
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {recordings.map((rec: any) => (
                <div key={rec.id} className="border-2 border-brand-navy p-3 bg-brand-off-white/40">
                  <h4 className="font-display font-black text-sm uppercase truncate text-brand-navy">
                    {rec.title}
                  </h4>
                  <p className="text-[10px] text-neutral-500 mt-1">
                    Recorded: {new Date(rec.recorded_at).toLocaleDateString()}
                  </p>
                  <audio controls src={rec.audio_url} className="w-full mt-2 h-8" preload="none" />
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
