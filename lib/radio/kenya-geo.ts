/**
 * Official Kenya County Mapping (47 Counties)
 * Maps Kenyan towns, sub-counties, and regions to ISO/IEBC County Codes (001 - 047).
 */

export interface ResolvedKenyaLocation {
  country: string | null;
  isKenya: boolean;
  countyCode: string | null;     // e.g. "022", "047", "001"
  countyName: string | null;     // Canonical uppercase e.g. "KIAMBU", "NAIROBI"
  canonicalCity: string | null;  // Normalized town/city name
  lat: number | null;
  lng: number | null;
}

export const KENYA_COUNTIES: Record<string, { code: string; name: string; defaultCentroid: [number, number] }> = {
  "001": { code: "001", name: "MOMBASA", defaultCentroid: [-4.0435, 39.6682] },
  "002": { code: "002", name: "KWALE", defaultCentroid: [-4.1737, 39.4521] },
  "003": { code: "003", name: "KILIFI", defaultCentroid: [-3.5107, 39.9093] },
  "004": { code: "004", name: "TANA RIVER", defaultCentroid: [-1.4997, 39.8166] },
  "005": { code: "005", name: "LAMU", defaultCentroid: [-2.2717, 40.9020] },
  "006": { code: "006", name: "TAITA TAVETA", defaultCentroid: [-3.3161, 38.3571] },
  "007": { code: "007", name: "GARISSA", defaultCentroid: [-0.4532, 39.6461] },
  "008": { code: "008", name: "WAJIR", defaultCentroid: [1.7471, 40.0573] },
  "009": { code: "009", name: "MANDERA", defaultCentroid: [3.9366, 41.8670] },
  "010": { code: "010", name: "MARSABIT", defaultCentroid: [2.3346, 37.9900] },
  "011": { code: "011", name: "ISIOLO", defaultCentroid: [0.3546, 37.5822] },
  "012": { code: "012", name: "MERU", defaultCentroid: [0.0463, 37.6559] },
  "013": { code: "013", name: "THARAKA-NITHI", defaultCentroid: [-0.2974, 37.8687] },
  "014": { code: "014", name: "EMBU", defaultCentroid: [-0.5344, 37.4571] },
  "015": { code: "015", name: "KITUI", defaultCentroid: [-1.3667, 38.0167] },
  "016": { code: "016", name: "MACHAKOS", defaultCentroid: [-1.5177, 37.2634] },
  "017": { code: "017", name: "MAKUENI", defaultCentroid: [-1.8041, 37.6203] },
  "018": { code: "018", name: "NYANDARUA", defaultCentroid: [-0.1804, 36.5230] },
  "019": { code: "019", name: "NYERI", defaultCentroid: [-0.4201, 36.9476] },
  "020": { code: "020", name: "KIRINYAGA", defaultCentroid: [-0.5000, 37.2833] },
  "021": { code: "021", name: "MURANG'A", defaultCentroid: [-0.7211, 37.1526] },
  "022": { code: "022", name: "KIAMBU", defaultCentroid: [-1.1714, 36.8356] },
  "023": { code: "023", name: "TURKANA", defaultCentroid: [3.1167, 35.6000] },
  "024": { code: "024", name: "WEST POKOT", defaultCentroid: [1.2333, 35.1167] },
  "025": { code: "025", name: "SAMBURU", defaultCentroid: [1.2667, 36.6667] },
  "026": { code: "026", name: "TRANS NZOIA", defaultCentroid: [1.0167, 35.0000] },
  "027": { code: "027", name: "UASIN GISHU", defaultCentroid: [0.5167, 35.2833] },
  "028": { code: "028", name: "ELGEYO-MARAKWET", defaultCentroid: [0.8000, 35.5000] },
  "029": { code: "029", name: "NANDI", defaultCentroid: [0.1833, 35.1000] },
  "030": { code: "030", name: "BARINGO", defaultCentroid: [0.5000, 35.7500] },
  "031": { code: "031", name: "LAIKIPIA", defaultCentroid: [0.3333, 36.7833] },
  "032": { code: "032", name: "NAKURU", defaultCentroid: [-0.3031, 36.0800] },
  "033": { code: "033", name: "NAROK", defaultCentroid: [-1.0833, 35.8667] },
  "034": { code: "034", name: "KAJIADO", defaultCentroid: [-1.8500, 36.7833] },
  "035": { code: "035", name: "KERICHO", defaultCentroid: [-0.3689, 35.2863] },
  "036": { code: "036", name: "BOMET", defaultCentroid: [-0.7813, 35.3416] },
  "037": { code: "037", name: "KAKAMEGA", defaultCentroid: [0.2827, 34.7519] },
  "038": { code: "038", name: "VIHIGA", defaultCentroid: [0.0833, 34.7167] },
  "039": { code: "039", name: "BUNGOMA", defaultCentroid: [0.5635, 34.5606] },
  "040": { code: "040", name: "BUSIA", defaultCentroid: [0.4608, 34.1115] },
  "041": { code: "041", name: "SIAYA", defaultCentroid: [0.0607, 34.2878] },
  "042": { code: "042", name: "KISUMU", defaultCentroid: [-0.0917, 34.7680] },
  "043": { code: "043", name: "HOMA BAY", defaultCentroid: [-0.5273, 34.4571] },
  "044": { code: "044", name: "MIGORI", defaultCentroid: [-1.0634, 34.4731] },
  "045": { code: "045", name: "KISII", defaultCentroid: [-0.6817, 34.7667] },
  "046": { code: "046", name: "NYAMIRA", defaultCentroid: [-0.5633, 34.9358] },
  "047": { code: "047", name: "NAIROBI", defaultCentroid: [-1.2921, 36.8219] },
};

export const TOWN_TO_COUNTY_CODE: Record<string, string> = {
  // Kiambu
  "thika": "022", "ruiru": "022", "kikuyu": "022", "limuru": "022", "juja": "022",
  "githunguri": "022", "karuri": "022", "kiambu": "022", "kabete": "022", "lari": "022",
  "gatundu": "022", "kahawa sukari": "022", "kahawa wendani": "022", "ruaka": "022",
  
  // Nairobi
  "nairobi": "047", "westlands": "047", "kilimani": "047", "karen": "047", "langata": "047",
  "kasarani": "047", "roysambu": "047", "south b": "047", "south c": "047", "eastleigh": "047",
  "embakasi": "047", "dagoretti": "047", "kibra": "047", "parklands": "047", "cbd": "047",
  "ngara": "047", "pangani": "047", "madaraka": "047", "buruburu": "047",
  
  // Nakuru
  "nakuru": "032", "naivasha": "032", "gilgil": "032", "njoro": "032", "molo": "032",
  
  // Coast
  "mombasa": "001", "nyali": "001", "bamburi": "001", "likoni": "001", "changamwe": "001",
  "diani": "002", "ukunda": "002", "kwale": "002",
  "kilifi": "003", "malindi": "003", "mtwapa": "003", "watamu": "003", "lamu": "005", "voi": "006",
  
  // Rift & Western
  "eldoret": "027", "kitale": "026", "kakamega": "037", "kisumu": "042", "kisii": "045",
  "kericho": "035", "bomet": "036", "bungoma": "039", "busia": "040", "siaya": "041",
  
  // Central & Eastern
  "nyeri": "019", "karatina": "019", "murang'a": "021", "kenol": "021", "embu": "014",
  "meru": "012", "machakos": "016", "athi river": "016", "mavoko": "016", "syokimau": "016",
  "kitui": "015", "nanyuki": "031", "isiolo": "011", "garissa": "007"
};

export function isValidCoordinate(lat?: number | null, lng?: number | null): boolean {
  if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function isWithinKenyaBounds(lat?: number | null, lng?: number | null): boolean {
  if (!isValidCoordinate(lat, lng)) return false;
  // Kenya bounding box approx: Lat -4.8 to 5.5, Lng 33.9 to 41.9
  return (lat as number) >= -5.0 && (lat as number) <= 5.5 && (lng as number) >= 33.5 && (lng as number) <= 42.0;
}

export function resolveKenyaLocation(
  rawCity?: string | null,
  rawCountry?: string | null,
  lat?: number | null,
  lng?: number | null
): ResolvedKenyaLocation {
  const country = rawCountry?.toUpperCase().trim() || null;
  const isKenya = country === "KE";

  if (!country) {
    return {
      country: null,
      isKenya: false,
      countyCode: null,
      countyName: null,
      canonicalCity: rawCity ? rawCity.trim() : null,
      lat: null,
      lng: null,
    };
  }

  if (!isKenya) {
    const valid = isValidCoordinate(lat, lng);
    return {
      country,
      isKenya: false,
      countyCode: null,
      countyName: null,
      canonicalCity: rawCity ? rawCity.trim() : null,
      lat: valid ? Math.round((lat as number) * 100) / 100 : null,
      lng: valid ? Math.round((lng as number) * 100) / 100 : null,
    };
  }

  const cleanCity = rawCity ? rawCity.trim().toLowerCase() : null;
  let matchedCode: string | null = null;

  if (cleanCity && TOWN_TO_COUNTY_CODE[cleanCity]) {
    matchedCode = TOWN_TO_COUNTY_CODE[cleanCity];
  } else if (cleanCity) {
    for (const [code, info] of Object.entries(KENYA_COUNTIES)) {
      if (info.name.toLowerCase() === cleanCity) {
        matchedCode = code;
        break;
      }
    }
  }

  // Centroid fallback ONLY if within strict Kenya bounding box and town is unmapped
  if (!matchedCode && isWithinKenyaBounds(lat, lng)) {
    let closestCode: string | null = null;
    let minDistance = Infinity;

    for (const [code, info] of Object.entries(KENYA_COUNTIES)) {
      const [cLat, cLng] = info.defaultCentroid;
      const d = Math.hypot((lat as number) - cLat, (lng as number) - cLng);
      if (d < minDistance) {
        minDistance = d;
        closestCode = code;
      }
    }
    // Strict threshold: 0.35 degrees (~38 km radius) to prevent border bleeding
    if (minDistance <= 0.35) {
      matchedCode = closestCode;
    }
  }

  const countyInfo = matchedCode ? KENYA_COUNTIES[matchedCode] : null;

  return {
    country: "KE",
    isKenya: true,
    countyCode: matchedCode,
    countyName: countyInfo ? countyInfo.name : null,
    canonicalCity: rawCity ? rawCity.trim() : null,
    lat: countyInfo ? countyInfo.defaultCentroid[0] : (isValidCoordinate(lat, lng) ? Math.round((lat as number) * 100) / 100 : null),
    lng: countyInfo ? countyInfo.defaultCentroid[1] : (isValidCoordinate(lat, lng) ? Math.round((lng as number) * 100) / 100 : null),
  };
}
