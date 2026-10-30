export interface TimelineSetItem {
  id: number;
  title: string;
  duration_sec?: number | null;
  [key: string]: any;
}

export function computeLiveTimeline(setsList: TimelineSetItem[]): { index: number; offsetSec: number } {
  if (!setsList || setsList.length === 0) return { index: 0, offsetSec: 0 };
  let totalDurationSec = 0;
  for (const s of setsList) {
    const d = typeof s.duration_sec === "number" && s.duration_sec > 0 ? s.duration_sec : 180;
    totalDurationSec += d;
  }
  if (totalDurationSec === 0) return { index: 0, offsetSec: 0 };
  const nowSec = Math.floor(Date.now() / 1000);
  const cycleSec = nowSec % totalDurationSec;
  let cumulative = 0;
  for (let i = 0; i < setsList.length; i++) {
    const item = setsList[i];
    const dur = item && typeof item.duration_sec === "number" && item.duration_sec > 0 ? item.duration_sec : 180;
    if (cumulative + dur > cycleSec) {
      return { index: i, offsetSec: cycleSec - cumulative };
    }
    cumulative += dur;
  }
  return { index: 0, offsetSec: 0 };
}
