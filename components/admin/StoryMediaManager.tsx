"use client";

import React, { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Film,
  Image as ImageIcon,
  Link2,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import {
  MAX_STORY_ITEMS,
  type StoryMediaItem,
} from "@/lib/story-media";
import {
  extractPosterFromVideoUrl,
  extractVideoPoster,
  uploadImageFile,
  uploadVideoFile,
  type ExtractedPosterMeta,
} from "@/lib/media-upload-client";

interface StoryMediaManagerProps {
  value: StoryMediaItem[];
  onChange: (items: StoryMediaItem[]) => void;
}

type UploadKind = "poster" | "video";

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isMediaUrl(value: string): boolean {
  return value.startsWith("/") || /^https?:\/\//i.test(value);
}

function formatDuration(seconds?: number | null): string {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const secs = String(s % 60).padStart(2, "0");
  return `${m}:${secs}`;
}

export default function StoryMediaManager({ value, onChange }: StoryMediaManagerProps) {
  const [uploading, setUploading] = useState<{ kind: UploadKind; progress: number } | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [urlKind, setUrlKind] = useState<UploadKind>("poster");
  const [urlValue, setUrlValue] = useState("");
  const [posterValue, setPosterValue] = useState("");

  const posterInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const videoPosterInputRef = useRef<HTMLInputElement | null>(null);
  const [targetPosterIndex, setTargetPosterIndex] = useState<number | null>(null);
  const [extractingIndex, setExtractingIndex] = useState<number | null>(null);

  const items = Array.isArray(value) ? value : [];
  const atCap = items.length >= MAX_STORY_ITEMS;

  const append = (item: StoryMediaItem) => {
    if (items.length >= MAX_STORY_ITEMS) {
      setError(`The deck is capped at ${MAX_STORY_ITEMS} slides.`);
      return;
    }
    onChange([...items, { ...item, id: item.id || makeId() }]);
  };

  const handlePosterFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Choose a PNG, JPG or WEBP image.");
      return;
    }
    setError("");
    setUploading({ kind: "poster", progress: 0 });
    setStatus("Uploading poster...");
    try {
      const url = await uploadImageFile(file);
      append({ kind: "poster", url });
      setStatus("");
    } catch (err: any) {
      setError(err?.message || "Poster upload failed.");
    } finally {
      setUploading(null);
      if (posterInputRef.current) posterInputRef.current.value = "";
    }
  };

  const handleVideoFile = async (file: File) => {
    const isVideo =
      file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogg|mkv)($|\?)/i.test(file.name);
    if (!isVideo) {
      setError("Choose an MP4, WEBM or MOV video.");
      return;
    }
    setError("");
    setUploading({ kind: "video", progress: 0 });
    setStatus("Extracting poster frame...");
    try {
      const meta = await extractVideoPoster(file).catch(() => ({} as ExtractedPosterMeta));
      setStatus("Uploading teaser to Cloudflare R2...");
      const url = await uploadVideoFile(file, (percent) => {
        setUploading({ kind: "video", progress: percent });
        setStatus(`Uploading teaser (${percent}%)...`);
      });
      setUploading({ kind: "video", progress: 100 });
      append({
        kind: "video",
        url,
        poster_url: meta.poster_url || null,
        duration: meta.duration || null,
        width: meta.width || null,
        height: meta.height || null,
        bytes: file.size || null,
      });
      setStatus("");
    } catch (err: any) {
      setError(err?.message || "Video upload failed.");
    } finally {
      setUploading(null);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  };

  const handleExtractFrame = async (index: number) => {
    const target = items[index];
    if (!target || target.kind !== "video") return;
    setError("");
    setExtractingIndex(index);
    setStatus("Extracting poster frame from video...");
    try {
      const posterUrl = await extractPosterFromVideoUrl(target.url);
      const updated = [...items];
      updated[index] = { ...target, poster_url: posterUrl };
      onChange(updated);
      setStatus("");
    } catch (err: any) {
      setError(
        "Could not automatically extract frame (video may have restrictive CORS). Please click 'Upload Poster' to select an image."
      );
    } finally {
      setExtractingIndex(null);
    }
  };

  const handleVideoPosterUpload = async (file: File) => {
    if (targetPosterIndex === null || targetPosterIndex >= items.length) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose a PNG, JPG or WEBP image.");
      return;
    }
    setError("");
    setUploading({ kind: "poster", progress: 0 });
    setStatus("Uploading poster image...");
    try {
      const url = await uploadImageFile(file);
      const updated = [...items];
      updated[targetPosterIndex] = { ...updated[targetPosterIndex], poster_url: url };
      onChange(updated);
      setStatus("");
    } catch (err: any) {
      setError(err?.message || "Poster upload failed.");
    } finally {
      setUploading(null);
      setTargetPosterIndex(null);
      if (videoPosterInputRef.current) videoPosterInputRef.current.value = "";
    }
  };

  const handleAddUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const url = urlValue.trim();
    if (!isMediaUrl(url)) {
      setError("Enter a path starting with / or a full http(s) URL.");
      return;
    }
    const poster = posterValue.trim();
    if (urlKind === "video" && poster && !isMediaUrl(poster)) {
      setError("The video poster must be a path starting with / or a full http(s) URL.");
      return;
    }
    append({
      kind: urlKind,
      url,
      ...(urlKind === "video" && poster ? { poster_url: poster } : {}),
    });
    setUrlValue("");
    setPosterValue("");
    setShowUrlForm(false);
    setError("");
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="text-xs font-black uppercase text-brand-navy flex items-center gap-1.5">
          <Film className="w-3.5 h-3.5 text-brand-navy" />
          Story Deck Media
          <span className="text-[10px] font-mono font-normal normal-case text-brand-navy/60">
            {items.length}/{MAX_STORY_ITEMS}
          </span>
        </label>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            disabled={!!uploading || atCap}
            onClick={() => posterInputRef.current?.click()}
            className="px-2 py-1 bg-white border-2 border-brand-navy text-[10px] font-mono font-black uppercase hover:bg-brand-navy hover:text-brand-off-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
          >
            <ImageIcon className="w-3 h-3" /> Add Poster
          </button>
          <button
            type="button"
            disabled={!!uploading || atCap}
            onClick={() => videoInputRef.current?.click()}
            className="px-2 py-1 bg-brand-accent border-2 border-brand-navy text-[10px] font-mono font-black uppercase hover:bg-brand-navy hover:text-brand-off-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
          >
            <Film className="w-3 h-3" /> Add Teaser
          </button>
          <button
            type="button"
            disabled={!!uploading || atCap}
            onClick={() => setShowUrlForm((v) => !v)}
            className="px-2 py-1 bg-white border-2 border-brand-navy text-[10px] font-mono font-black uppercase hover:bg-brand-navy hover:text-brand-off-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
            title="Add an existing cloud or local media URL"
          >
            <Link2 className="w-3 h-3" /> Add by URL
          </button>
        </div>
      </div>

      <input
        ref={posterInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handlePosterFile(file);
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleVideoFile(file);
        }}
      />
      <input
        ref={videoPosterInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleVideoPosterUpload(file);
        }}
      />

      {items.length === 0 ? (
        <div className="border-2 border-dashed border-brand-navy/40 bg-white p-3 text-center">
          <Upload className="w-5 h-5 mx-auto text-brand-navy/50 mb-1" />
          <p className="text-[11px] font-mono font-bold uppercase text-brand-navy/70">
            No custom slides yet
          </p>
          <p className="text-[10px] font-mono text-brand-navy/60 mt-1">
            The homepage will use the event poster and the default hype video.
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((item, index) => {
              const thumb = item.kind === "poster" ? item.url : item.poster_url || "";
              const maxW = item.width ? Math.min(item.width, 360) : 360;
              const aspect = item.width && item.height ? item.width / item.height : 320 / 180;
              const previewH = Math.round(maxW / aspect);
              const previewW = Math.min(maxW, 200);
              const previewHClamped = Math.min(previewH, 112);
              return (
                <li
                  key={item.id || `${item.kind}-${item.url}-${index}`}
                  className="flex items-center gap-3 border-2 border-brand-navy bg-white p-2 rounded-sm"
                >
                  <span className="w-5 shrink-0 text-center text-[10px] font-mono font-black text-brand-navy/60">
                    {index + 1}
                  </span>
                  <div
                    className="shrink-0 border border-brand-navy bg-brand-navy overflow-hidden flex items-center justify-center relative"
                    style={{ width: Math.min(maxW, 200), height: Math.min(previewH, 112) }}
                  >
                    {thumb ? (
                      // Admin-only preview. Plain <img> because custom hosts are
                      // not guaranteed to be in next.config remotePatterns.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.currentTarget as HTMLImageElement;
                          target.style.display = "none";
                          const parent = target.parentElement;
                          if (parent) parent.classList.add("flex");
                        }}
                      />
                    ) : item.kind === "video" ? (
                      <video
                        src={`${item.url}#t=0.5`}
                        className="w-full h-full object-cover pointer-events-none"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-white/70" />
                    )}

                    {item.kind === "video" && (
                      <span className="absolute bottom-1 right-1 bg-brand-navy/85 text-white text-[8px] font-mono px-1 py-0.5 rounded flex items-center gap-0.5 pointer-events-none shadow-xs">
                        <Film className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[9px] font-mono font-black uppercase px-1 py-0.5 border border-brand-navy ${
                          item.kind === "video"
                            ? "bg-brand-accent text-brand-navy"
                            : "bg-brand-navy text-brand-off-white"
                        }`}
                      >
                        {item.kind === "video" ? "Video" : "Poster"}
                      </span>
                      {item.kind === "video" && formatDuration(item.duration) && (
                        <span className="text-[9px] font-mono font-bold text-brand-navy/60">
                          {formatDuration(item.duration)}
                        </span>
                      )}
                      {!thumb && item.kind === "video" && (
                        <span className="text-[9px] font-mono text-amber-700 bg-amber-50 px-1 py-0.5 border border-amber-300 rounded">
                          no poster frame
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-mono text-brand-navy/70 truncate mt-0.5" title={item.url}>
                      {item.url}
                    </p>
                    {item.kind === "video" && item.poster_url && (
                      <p className="text-[9px] font-mono text-brand-navy/55 truncate" title={item.poster_url}>
                        poster: {item.poster_url}
                      </p>
                    )}
                    {item.kind === "video" && (
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        <button
                          type="button"
                          disabled={!!uploading || extractingIndex === index}
                          onClick={() => handleExtractFrame(index)}
                          className="px-1.5 py-0.5 bg-brand-sand/50 border border-brand-navy/40 hover:bg-brand-navy hover:text-white text-[9px] font-mono flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                          title="Extract a frame from the video as its poster"
                        >
                          {extractingIndex === index ? (
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          ) : (
                            <Camera className="w-2.5 h-2.5" />
                          )}
                          {item.poster_url ? "Re-extract Frame" : "Extract Frame"}
                        </button>
                        <button
                          type="button"
                          disabled={!!uploading || extractingIndex === index}
                          onClick={() => {
                            setTargetPosterIndex(index);
                            videoPosterInputRef.current?.click();
                          }}
                          className="px-1.5 py-0.5 bg-white border border-brand-navy/40 hover:bg-brand-navy hover:text-white text-[9px] font-mono flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                          title="Upload a custom poster image for this video"
                        >
                          <ImageIcon className="w-2.5 h-2.5" />
                          {item.poster_url ? "Change Poster" : "Upload Poster"}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move slide ${index + 1} earlier`}
                      title="Move earlier"
                      className="p-1.5 border border-brand-navy/30 hover:bg-brand-navy hover:text-white disabled:opacity-25 disabled:cursor-default cursor-pointer"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === items.length - 1}
                      aria-label={`Move slide ${index + 1} later`}
                      title="Move later"
                      className="p-1.5 border border-brand-navy/30 hover:bg-brand-navy hover:text-white disabled:opacity-25 disabled:cursor-default cursor-pointer"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      aria-label={`Remove slide ${index + 1}`}
                      title="Remove"
                      className="p-1.5 border border-red-400/50 text-red-600 hover:bg-red-600 hover:text-white cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <InfoPanel items={items} />
        </>
      )}

      {showUrlForm && (
        <form
          onSubmit={handleAddUrl}
          className="border-2 border-dashed border-brand-navy/50 bg-white p-2.5 space-y-2"
        >
          <div className="flex items-center gap-3">
            <label className="text-[10px] font-black uppercase flex items-center gap-1">
              <input
                type="radio"
                name="story-url-kind"
                checked={urlKind === "poster"}
                onChange={() => setUrlKind("poster")}
              />
              Poster
            </label>
            <label className="text-[10px] font-black uppercase flex items-center gap-1">
              <input
                type="radio"
                name="story-url-kind"
                checked={urlKind === "video"}
                onChange={() => setUrlKind("video")}
              />
              Video
            </label>
          </div>
          <input
            type="text"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder={
              urlKind === "video"
                ? "https://...r2.dev/videos/... or https://files.catbox.moe/teaser.mp4"
                : "https://i.ibb.co/poster.jpg or /flyer.png"
            }
            className="w-full px-2.5 py-1.5 border-2 border-brand-navy font-mono text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-accent"
          />
          {urlKind === "video" && (
            <input
              type="text"
              value={posterValue}
              onChange={(e) => setPosterValue(e.target.value)}
              placeholder="Optional poster frame URL (shown while the video buffers)"
              className="w-full px-2.5 py-1.5 border-2 border-brand-navy font-mono text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-accent"
            />
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="px-2.5 py-1 bg-brand-navy text-white text-[10px] font-mono font-black uppercase hover:bg-brand-navy-light flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add Slide
            </button>
            <button
              type="button"
              onClick={() => setShowUrlForm(false)}
              className="px-2.5 py-1 border-2 border-brand-navy text-[10px] font-mono font-black uppercase hover:bg-brand-navy hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {uploading && (
        <div className="flex items-center gap-3 p-2 bg-brand-accent/20 border-2 border-brand-navy text-[11px] font-mono font-bold">
          <Loader2 className="w-4 h-4 animate-spin" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-mono font-bold">{status || "Uploading..."}</span>
            </div>
            <div className="h-1.5 bg-brand-navy/15 overflow-hidden">
              <div
                className="h-full bg-brand-accent transition-[width]"
                style={{ width: `${uploading.progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-2 bg-red-100 border border-red-500 text-red-800 text-[11px] font-mono font-bold flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="ml-2 font-bold">
            &times;
          </button>
        </div>
      )}
    </div>
  );
}

function InfoPanel({ items }: { items: StoryMediaItem[] }) {
  const hasMissingPosters = items.some(i => i.kind === "video" && !i.poster_url);
  return (
    <div className="text-[10px] font-mono text-brand-navy/70 leading-snug space-y-1">
      <p className="whitespace-pre-line">
        Plays in this order on the homepage hero. Posters hold for 5 seconds; teasers play to the
        end. The first poster is also the social-share card. One slide ahead is prefetched — never
        the whole deck.
      </p>
      {hasMissingPosters && (
        <p className="text-amber-700">
          Some videos have no poster frame yet — the hero will still play, but the grid tile will
          only show the Film icon until a frame is extracted.
        </p>
      )}
    </div>
  );
}
