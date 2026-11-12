"use client";

import React, { useEffect, useState } from "react";
import { Sparkles, ExternalLink } from "lucide-react";

interface Sponsor {
  id: number;
  name: string;
  logo_url?: string | null;
  link_url?: string | null;
  tagline?: string | null;
  show_id?: number | null;
}

export default function SponsorBanner({ showId }: { showId?: number }) {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);

  useEffect(() => {
    fetch("/api/radio/sponsors")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.sponsors)) {
          if (showId) {
            const filtered = data.sponsors.filter((s: Sponsor) => !s.show_id || s.show_id === showId);
            setSponsors(filtered);
          } else {
            setSponsors(data.sponsors);
          }
        }
      })
      .catch(() => {});
  }, [showId]);

  if (sponsors.length === 0) return null;

  return (
    <div className="bg-[#142B4C]/5 border border-[#142B4C]/20 p-2.5 rounded font-mono text-xs flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-[#C8A54A] shrink-0" />
        <span className="text-[10px] uppercase font-bold text-[#142B4C]/60 tracking-wider">
          BROUGHT TO YOU BY
        </span>
      </div>

      <div className="flex items-center gap-3">
        {sponsors.map((s) => (
          <div key={s.id} className="flex items-center gap-1.5">
            {s.logo_url && (
              <img src={s.logo_url} alt={s.name} className="h-5 w-auto object-contain max-w-[80px]" />
            )}
            <span className="font-bold text-[#142B4C] text-xs">{s.name}</span>
            {s.tagline && <span className="text-[10px] text-[#142B4C]/70">· {s.tagline}</span>}
            {s.link_url && (
              <a
                href={s.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#C8A54A] hover:underline inline-flex items-center"
              >
                <ExternalLink className="w-3 h-3 ml-0.5" />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
