/**
 * Browser-side media upload helpers shared by the story deck editor and the
 * gallery. Kept out of the components so both flows upload and extract poster
 * frames the same way.
 */

export interface ExtractedPosterMeta {
  poster_url?: string;
  duration?: number;
  width?: number;
  height?: number;
}

/**
 * Read a fetch response as JSON only when the server actually sent JSON.
 *
 * The upload routes live behind `requireAdmin()`, and Next.js in the Edge
 * runtime can return an HTML/plain-text error page (e.g. a 413 body-too-large
 * page, or a 401 "Unauthorized") instead of the route handler's JSON reply.
 * Calling `.json()` unconditionally on those responses throws
 * "Unexpected token 'R'..." because the body starts with "Request Entity...".
 *
 * This helper reads `Content-Type` first; on a non-JSON reply it falls back to
 * `.text()` and re-throws a message the caller can surface to the admin.
 */
async function safeJson<T>(res: Response): Promise<T> {
  const ct = res.headers.get("content-type") || "";
  if (ct.toLowerCase().includes("application/json")) return res.json() as Promise<T>;
  const text = await res.text().catch(() => "");
  if (res.status === 413 || text.includes("Request Entity Too Large")) {
    throw new Error("File is too large for server upload. Please use 'Add by URL' or compress the file.");
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error("Admin session expired or unauthorized. Please log in again.");
  }
  throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
}

export async function uploadImageFile(file: File): Promise<string> {
  // Try direct-to-R2 upload first if available
  try {
    const presignedRes = await fetch("/api/admin/presigned-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name || "image.jpg",
        contentType: file.type || "image/jpeg",
        folder: "posters",
      }),
    });
    if (presignedRes.ok) {
      const { uploadUrl, publicUrl } = await presignedRes.json();
      if (uploadUrl && publicUrl) {
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "image/jpeg" },
          body: file,
        });
        if (uploadRes.ok) {
          return publicUrl;
        }
      }
    }
  } catch (err) {
    console.warn("Direct R2 image upload fallback to server:", err);
  }

  // Fallback to server route (ImgBB)
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch("/api/admin/upload-image", { method: "POST", body: formData });
  if (res.status === 413) {
    throw new Error(`Image file too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Please compress or enter URL.`);
  }
  const data = await safeJson<{ url?: string; error?: string }>(res);
  if (!res.ok || !data.url) throw new Error(data.error || "Image upload failed");
  return data.url as string;
}

export async function uploadVideoFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  // Tier 0: Direct browser-to-R2 upload (Bypasses Vercel 4.5MB limit completely)
  try {
    const presignedRes = await fetch("/api/admin/presigned-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name || "video.mp4",
        contentType: file.type || "video/mp4",
        folder: "videos",
      }),
    });

    if (presignedRes.ok) {
      const { uploadUrl, publicUrl } = await presignedRes.json();
      if (uploadUrl && publicUrl) {
        // Upload directly from browser to Cloudflare R2 with XMLHttpRequest for progress tracking
        return await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", uploadUrl);
          xhr.setRequestHeader("Content-Type", file.type || "video/mp4");

          if (xhr.upload && onProgress) {
            xhr.upload.onprogress = (event) => {
              if (event.lengthComputable) {
                const percent = Math.round((event.loaded / event.total) * 100);
                onProgress(percent);
              }
            };
          }

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(publicUrl);
            } else {
              reject(new Error(`R2 direct upload HTTP ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error("Network error during direct video upload to Cloudflare R2"));
          xhr.send(file);
        });
      }
    }
  } catch (err: any) {
    console.warn("Direct R2 upload attempt failed, trying fallback:", err.message);
  }

  // Fallback to server route (for small files under 4.5 MB via Catbox/Pomf)
  const formData = new FormData();
  formData.append("video", file);
  const res = await fetch("/api/admin/upload-video", { method: "POST", body: formData });
  if (res.status === 413) {
    throw new Error(`Video file too large (${(file.size / (1024 * 1024)).toFixed(1)} MB) for fallback server. Please use "Add by URL".`);
  }
  const data = await safeJson<{ url?: string; error?: string }>(res);
  if (!res.ok || !data.url) throw new Error(data.error || "Video upload failed");
  return data.url as string;
}

/**
 * Pull one frame out of the selected video and upload it as a poster.
 * This is what keeps grids and story slides instant: the poster paints while
 * the video buffers, and a grid never has to fetch a video just for a tile.
 */
export async function extractVideoPoster(file: File): Promise<ExtractedPosterMeta> {
  return new Promise((resolve) => {
    let settled = false;
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const finish = (result: ExtractedPosterMeta) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };

    const timeout = setTimeout(() => finish({}), 9000);

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : undefined;
      const width = video.videoWidth || undefined;
      const height = video.videoHeight || undefined;
      try {
        video.currentTime = Math.min(Math.max(video.duration * 0.1, 0.4), 3);
      } catch {
        clearTimeout(timeout);
        finish({ duration, width, height });
      }
    };

    video.onseeked = () => {
      try {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) throw new Error("no dimensions");
        const scale = Math.min(1, 720 / width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no canvas");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          async (blob) => {
            clearTimeout(timeout);
            let posterUrl: string | undefined;
            if (blob) {
              try {
                posterUrl = await uploadImageFile(
                  new File([blob], "video-poster.jpg", { type: "image/jpeg" })
                );
              } catch {
                // A missing poster is not fatal: callers fall back to their
                // existing artwork. Never block the video over it.
              }
            }
            finish({
              poster_url: posterUrl,
              duration: Number.isFinite(video.duration) ? video.duration : undefined,
              width: video.videoWidth || undefined,
              height: video.videoHeight || undefined,
            });
          },
          "image/jpeg",
          0.82
        );
      } catch {
        clearTimeout(timeout);
        finish({
          duration: Number.isFinite(video.duration) ? video.duration : undefined,
          width: video.videoWidth || undefined,
          height: video.videoHeight || undefined,
        });
      }
    };

    video.onerror = () => {
      clearTimeout(timeout);
      finish({});
    };

    video.src = objectUrl;
    video.load();
  });
}
