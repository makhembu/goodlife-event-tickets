import type { Metadata } from "next";
import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { neonQuery } from "@/lib/supabase-db";
import { SITE_NAME, TWITTER_HANDLE, siteUrl } from "@/lib/seo";
import { ArrowLeft, Radio, Calendar, ExternalLink, Globe } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const res = await neonQuery(
    `SELECT dj_name, bio FROM presenters WHERE slug = $1 LIMIT 1;`,
    [slug]
  );
  if (!res.rows || res.rows.length === 0) return {};
  const presenter = res.rows[0];
  const baseUrl = siteUrl();
  const pageUrl = `${baseUrl}/radio/presenters/${slug}`;
  const title = `${presenter.dj_name} | GOODLIFE Radio 254`;
  const description = presenter.bio || `Listen to ${presenter.dj_name} on GOODLIFE Radio 254.`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: "profile",
      title,
      description,
      url: pageUrl,
      siteName: SITE_NAME,
      locale: "en_KE",
    },
    twitter: {
      card: "summary_large_image",
      site: TWITTER_HANDLE,
      title,
      description,
    },
  };
}

export default async function PresenterDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const presRes = await neonQuery(
    `SELECT id, full_name, dj_name, slug, bio, avatar_url, social_links, status
     FROM presenters
     WHERE slug = $1 AND status != 'suspended' LIMIT 1;`,
    [slug]
  );

  if (!presRes.rows || presRes.rows.length === 0) {
    notFound();
  }

  const presenter = presRes.rows[0];

  // Fetch shows hosted by this presenter
  const showsRes = await neonQuery(
    `SELECT id, title, slug, description, genre, cover_image_url, recurrence_pattern, recurrence_days
     FROM shows
     WHERE primary_presenter_id = $1 AND is_active = true
     ORDER BY title ASC;`,
    [presenter.id]
  );
  const shows = showsRes.rows || [];

  // Fetch upcoming slots
  const slotsRes = await neonQuery(
    `SELECT sl.id, sl.starts_at, sl.ends_at, sh.title as show_title, sh.slug as show_slug
     FROM show_slots sl
     JOIN shows sh ON sh.id = sl.show_id
     WHERE sl.presenter_id = $1 AND sl.ends_at > NOW() AND sl.status != 'cancelled'
     ORDER BY sl.starts_at ASC
     LIMIT 5;`,
    [presenter.id]
  );
  const upcomingSlots = slotsRes.rows || [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: presenter.dj_name,
    description: presenter.bio,
    url: `${siteUrl()}/radio/presenters/${presenter.slug}`,
    image: presenter.avatar_url,
    jobTitle: "Radio Presenter & DJ",
    worksFor: {
      "@type": "RadioStation",
      name: "GOODLIFE Radio 254",
    },
  };

  const socials = presenter.social_links || {};

  return (
    <div className="min-h-screen bg-brand-off-white text-brand-navy font-mono pb-24 selection:bg-brand-accent selection:text-brand-navy">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="border-b-4 border-brand-navy bg-brand-navy text-brand-off-white px-4 py-4 sm:px-8">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
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

      <main className="max-w-4xl mx-auto px-4 py-8 sm:px-8 space-y-8">
        {/* Presenter Profile Card */}
        <div className="border-4 border-brand-navy bg-white shadow-[6px_6px_0px_#142B4C] p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-start">
          <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full border-4 border-brand-navy bg-brand-navy/10 overflow-hidden shrink-0 mx-auto sm:mx-0">
            {presenter.avatar_url ? (
              <img
                src={presenter.avatar_url}
                alt={presenter.dj_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-display text-4xl sm:text-5xl font-black text-brand-navy">
                {presenter.dj_name.slice(0, 1)}
              </div>
            )}
          </div>

          <div className="flex-1 space-y-3 text-center sm:text-left">
            <span className="bg-brand-accent text-brand-navy text-[10px] font-black uppercase px-2.5 py-1 border border-brand-navy inline-block">
              Resident Presenter
            </span>
            <h1 className="font-display text-3xl sm:text-5xl font-black uppercase tracking-tight text-brand-navy leading-none">
              {presenter.dj_name}
            </h1>
            <p className="text-xs uppercase text-neutral-500 font-bold">{presenter.full_name}</p>

            <p className="text-sm text-neutral-800 font-sans leading-relaxed pt-2">
              {presenter.bio || "Resident DJ & Radio Presenter broadcasting live on GOODLIFE Radio 254 from Nairobi."}
            </p>

            {/* Social Links */}
            {Object.keys(socials).length > 0 && (
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-2">
                {Object.entries(socials).map(([net, url]) => (
                  <a
                    key={net}
                    href={String(url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-bold uppercase bg-neutral-100 hover:bg-brand-accent hover:text-brand-navy px-2.5 py-1 border border-brand-navy/30 rounded transition-colors flex items-center gap-1"
                  >
                    <Globe className="w-3 h-3" /> {net}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Shows by this Presenter */}
        <div className="border-3 border-brand-navy bg-white p-6 shadow-[4px_4px_0px_#142B4C]">
          <h2 className="font-display text-xl uppercase tracking-wide text-brand-navy border-b-2 border-brand-navy pb-2 mb-4">
            Shows on GOODLIFE Radio
          </h2>

          {shows.length === 0 ? (
            <p className="text-xs text-neutral-500 py-4">No regular shows registered.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {shows.map((show: any) => (
                <Link
                  key={show.id}
                  href={`/radio/shows/${show.slug}`}
                  className="border-2 border-brand-navy p-4 bg-brand-off-white/40 hover:bg-brand-accent/20 transition-all flex items-start gap-3 group"
                >
                  <div className="w-12 h-12 bg-brand-navy border border-brand-navy shrink-0 overflow-hidden">
                    {show.cover_image_url ? (
                      <img src={show.cover_image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white font-black">
                        {show.title.slice(0, 1)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-black uppercase text-brand-navy/70 block">
                      {show.genre}
                    </span>
                    <h3 className="font-display font-black text-lg uppercase truncate text-brand-navy group-hover:text-brand-accent transition-colors">
                      {show.title}
                    </h3>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Air Dates */}
        {upcomingSlots.length > 0 && (
          <div className="border-3 border-brand-navy bg-white p-6 shadow-[4px_4px_0px_#142B4C]">
            <h2 className="font-display text-xl uppercase tracking-wide text-brand-navy border-b-2 border-brand-navy pb-2 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-brand-accent" /> Upcoming Broadcasts
            </h2>
            <ul className="divide-y divide-brand-navy/10 font-mono text-xs">
              {upcomingSlots.map((slot: any) => {
                const d = new Date(slot.starts_at);
                const end = new Date(slot.ends_at);
                return (
                  <li key={slot.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-bold">{d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</span>
                      <span className="text-neutral-500 ml-2">({d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" })} EAT)</span>
                    </div>
                    <Link href={`/radio/shows/${slot.show_slug}`} className="font-bold underline text-brand-navy hover:text-brand-accent">
                      {slot.show_title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
