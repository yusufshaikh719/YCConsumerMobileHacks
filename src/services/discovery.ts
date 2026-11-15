import { distanceMeters } from "../lib/geo";
import type { Landmark, LatLng } from "./types";

export const USER_AGENT = "Ante/1.0 (sidequest demo; https://github.com/yusufshaikh719/YCConsumerMobileHacks)";
const HEADERS = { Accept: "application/json", "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT };
const WALK_M_PER_MIN = 78;
const DETOUR = 1.3;

export const walkMinutesFor = (meters: number) => Math.max(1, Math.ceil((meters * DETOUR) / WALK_M_PER_MIN));

export const TARGET_BAND: [number, number] = [550, 1000];
export const WIDE_BAND: [number, number] = [300, 1800];
const IDEAL_METERS = 780;

export type Candidate = Omit<Landmark, "radiusMeters"> & { distance: number };

type Fetch = typeof fetch;

async function getJson(fetcher: Fetch, url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(url, { ...init, headers: { ...HEADERS, ...(init.headers as Record<string, string>) }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const firstSentence = (text: string) => {
  const clean = text.replace(/\s+/g, " ").replace(/\s*\([^)]*\)/g, "").trim();
  const sentence = clean.match(/^.*?[.!?](\s|$)/)?.[0]?.trim() ?? clean;
  return sentence.length > 170 ? `${sentence.slice(0, 167).trimEnd()}…` : sentence;
};

const usable = (name: string) => !/^(list of|outline of|timeline of|history of)\b/i.test(name) && !/\b(station|street|avenue|road|school district|census)\b/i.test(name);

export async function wikipediaCandidates(origin: LatLng, radius: number, fetcher: Fetch = fetch): Promise<Candidate[]> {
  const params = new URLSearchParams({
    action: "query",
    generator: "geosearch",
    ggscoord: `${origin.lat}|${origin.lng}`,
    ggsradius: String(Math.min(10_000, radius)),
    ggslimit: "50",
    prop: "coordinates|pageimages|description|extracts",
    piprop: "thumbnail",
    pithumbsize: "320",
    exintro: "1",
    explaintext: "1",
    exsentences: "2",
    exlimit: "20",
    format: "json",
    formatversion: "2",
  });
  const body = await getJson(fetcher, `https://en.wikipedia.org/w/api.php?${params}`);
  const pages: any[] = Array.isArray(body?.query?.pages) ? body.query.pages : [];
  return pages.flatMap(page => {
    const coords = page.coordinates?.[0];
    if (typeof page.title !== "string" || typeof coords?.lat !== "number" || typeof coords?.lon !== "number" || !usable(page.title)) return [];
    const at = { lat: coords.lat, lng: coords.lon };
    const blurb = typeof page.extract === "string" && page.extract.trim() ? firstSentence(page.extract) : typeof page.description === "string" ? page.description : "";
    return [{
      id: `wiki-${page.pageid}`,
      name: page.title,
      neighborhood: typeof page.description === "string" && page.description.length < 48 ? page.description : "Nearby",
      coords: at,
      thumbnail: page.thumbnail?.source ? { uri: page.thumbnail.source } : null,
      trivia: blurb || `A local landmark worth the walk.`,
      source: "Wikipedia" as const,
      url: `https://en.wikipedia.org/?curid=${page.pageid}`,
      distance: distanceMeters(origin, at),
    }];
  });
}

export async function openStreetMapCandidates(origin: LatLng, radius: number, fetcher: Fetch = fetch): Promise<Candidate[]> {
  const around = `around:${radius},${origin.lat},${origin.lng}`;
  const query = `[out:json][timeout:8];(nwr["name"]["tourism"~"^(attraction|viewpoint|artwork|museum|gallery)$"](${around});nwr["name"]["historic"](${around});nwr["name"]["leisure"~"^(park|garden)$"](${around});nwr["name"]["amenity"="fountain"](${around}););out center 60;`;
  const body = await getJson(fetcher, "https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });
  const elements: any[] = Array.isArray(body?.elements) ? body.elements : [];
  return elements.flatMap(el => {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const name = el.tags?.name;
    if (typeof name !== "string" || typeof lat !== "number" || typeof lng !== "number") return [];
    const kind = el.tags?.tourism ?? el.tags?.historic ?? el.tags?.leisure ?? el.tags?.amenity ?? "landmark";
    return [{
      id: `osm-${el.type}-${el.id}`,
      name,
      neighborhood: String(kind).replace(/_/g, " "),
      coords: { lat, lng },
      thumbnail: null,
      trivia: typeof el.tags?.description === "string" ? firstSentence(el.tags.description) : `A ${String(kind).replace(/_/g, " ")} mapped by OpenStreetMap contributors.`,
      source: "OpenStreetMap" as const,
      url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      distance: distanceMeters(origin, { lat, lng }),
    }];
  });
}

export function pickLandmark(candidates: Candidate[], [min, max]: [number, number], random: () => number = Math.random): Landmark | null {
  const inBand = candidates.filter(c => c.distance >= min && c.distance <= max);
  if (!inBand.length) return null;
  const scored = inBand
    .map(c => ({ c, score: Math.abs(c.distance - IDEAL_METERS) - (c.thumbnail ? 150 : 0) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);
  const { distance: _distance, ...landmark } = scored[Math.floor(random() * scored.length)].c;
  return { ...landmark, radiusMeters: 50 };
}

export async function discoverLandmark(origin: LatLng, fetcher: Fetch = fetch, random: () => number = Math.random): Promise<Landmark | null> {
  const attempts: (() => Promise<Landmark | null>)[] = [
    async () => pickLandmark(await wikipediaCandidates(origin, 1200, fetcher), TARGET_BAND, random),
    async () => pickLandmark(await openStreetMapCandidates(origin, 1100, fetcher), TARGET_BAND, random),
    async () => pickLandmark(await wikipediaCandidates(origin, 2000, fetcher), WIDE_BAND, random),
    async () => pickLandmark(await openStreetMapCandidates(origin, 2000, fetcher), WIDE_BAND, random),
  ];
  for (const attempt of attempts) {
    try {
      const found = await attempt();
      if (found) return found;
    } catch {
      continue;
    }
  }
  return null;
}
