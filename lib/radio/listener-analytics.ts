import { neonQuery } from "@/lib/supabase-db";
import { KENYA_COUNTIES } from "./kenya-geo";

export interface ListenerMapCluster {
  countyCode: string;
  countyName: string;
  count: number;
  lat: number;
  lng: number;
  cities: string[];
}

export interface ListenerAnalytics {
  totalActive: number;
  kenyaListeners: number;
  countyMappedListeners: number;
  unmappedKenyaListeners: number;
  diasporaListeners: number;
  unlocatedListeners: number;
  activeCounties: string[];
  clusters: ListenerMapCluster[];
  diaspora: Array<{ country: string; city: string | null; count: number }>;
  cachedAt: number;
}

let _analyticsCache: ListenerAnalytics | null = null;
const CACHE_TTL_MS = 5000;

export async function getListenerAnalytics(forceFresh = false): Promise<ListenerAnalytics> {
  const now = Date.now();
  if (!forceFresh && _analyticsCache && now - _analyticsCache.cachedAt < CACHE_TTL_MS) {
    return _analyticsCache;
  }

  try {
    const { rows } = await neonQuery(
      `SELECT 
         county_code,
         county_name,
         city,
         country,
         COUNT(DISTINCT session_id)::int as count
       FROM radio_listener_pings
       WHERE last_seen >= NOW() - INTERVAL '45 seconds'
       GROUP BY county_code, county_name, city, country
       ORDER BY count DESC`
    );

    let kenyaCount = 0;
    let countyMappedCount = 0;
    let unmappedKenyaCount = 0;
    let diasporaCount = 0;
    let unlocatedCount = 0;
    const countyClusterMap = new Map<string, ListenerMapCluster>();
    const diasporaList: Array<{ country: string; city: string | null; count: number }> = [];

    for (const r of rows || []) {
      const c = Number(r.count) || 0;
      if (r.country === "KE") {
        kenyaCount += c;
        const code = r.county_code;
        if (code && KENYA_COUNTIES[code]) {
          countyMappedCount += c;
          if (!countyClusterMap.has(code)) {
            const info = KENYA_COUNTIES[code];
            countyClusterMap.set(code, {
              countyCode: code,
              countyName: info.name,
              count: 0,
              lat: info.defaultCentroid[0],
              lng: info.defaultCentroid[1],
              cities: [],
            });
          }
          const item = countyClusterMap.get(code)!;
          item.count += c;
          if (r.city && !item.cities.includes(r.city)) {
            item.cities.push(r.city);
          }
        } else {
          unmappedKenyaCount += c;
        }
      } else if (r.country && r.country !== "KE") {
        diasporaCount += c;
        diasporaList.push({
          country: r.country,
          city: r.city || null,
          count: c,
        });
      } else {
        unlocatedCount += c;
      }
    }

    const result: ListenerAnalytics = {
      totalActive: kenyaCount + diasporaCount + unlocatedCount,
      kenyaListeners: kenyaCount,
      countyMappedListeners: countyMappedCount,
      unmappedKenyaListeners: unmappedKenyaCount,
      diasporaListeners: diasporaCount,
      unlocatedListeners: unlocatedCount,
      activeCounties: Array.from(countyClusterMap.values()).map((c) => c.countyName),
      clusters: Array.from(countyClusterMap.values()),
      diaspora: diasporaList,
      cachedAt: now,
    };

    _analyticsCache = result;
    return result;
  } catch (err) {
    console.warn("[listener-analytics] Aggregation query failed:", err);
    if (_analyticsCache) return _analyticsCache;
    return {
      totalActive: 0,
      kenyaListeners: 0,
      countyMappedListeners: 0,
      unmappedKenyaListeners: 0,
      diasporaListeners: 0,
      unlocatedListeners: 0,
      activeCounties: [],
      clusters: [],
      diaspora: [],
      cachedAt: now,
    };
  }
}
