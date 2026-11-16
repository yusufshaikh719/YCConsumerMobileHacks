import { describe, expect, it, vi } from "vitest";
import { distanceMeters } from "../../lib/geo";
import { discoverLandmark, openStreetMapCandidates, pickLandmark, TARGET_BAND, USER_AGENT, walkMinutesFor, wikipediaCandidates, type Candidate } from "../discovery";

const origin = { lat: 40.0, lng: -73.0 };
const north = (meters: number) => ({ lat: origin.lat + meters / 111_195, lng: origin.lng });

const page = (id: number, meters: number, extra: object = {}) => ({
  pageid: id,
  title: `Place ${id}`,
  coordinates: [{ lat: north(meters).lat, lon: north(meters).lng }],
  description: "Park in Riverside",
  extract: "A lovely park. It has a pond.",
  ...extra,
});
const element = (id: number, meters: number, tags: object = { name: `Spot ${id}`, tourism: "viewpoint" }) => ({ type: "node", id, lat: north(meters).lat, lon: north(meters).lng, tags });

function respond(...bodies: unknown[]) {
  const queue = [...bodies];
  return vi.fn(async (_url: string, _init?: RequestInit) => {
    const body = queue.shift();
    if (body instanceof Error) throw body;
    if (body === 500) return { ok: false, status: 500, json: async () => ({}) } as Response;
    return { ok: true, status: 200, json: async () => body } as Response;
  });
}

const wiki = (...pages: object[]) => ({ query: { pages } });
const osm = (...elements: object[]) => ({ elements });

describe("Wikipedia candidates", () => {
  it("sends a real User-Agent and Accept header and asks around the user's position", async () => {
    const fetcher = respond(wiki(page(1, 800, { thumbnail: { source: "https://upload.example/1.jpg" } })));
    const [found] = await wikipediaCandidates(origin, 1200, fetcher as unknown as typeof fetch);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toContain("generator=geosearch");
    expect(url).toContain(`ggscoord=${origin.lat}%7C${origin.lng}`);
    expect(url).toContain("ggsradius=1200");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/json");
    expect(headers["User-Agent"]).toBe(USER_AGENT);
    expect(headers["Api-User-Agent"]).toBe(USER_AGENT);
    expect(found).toMatchObject({ id: "wiki-1", name: "Place 1", source: "Wikipedia", thumbnail: { uri: "https://upload.example/1.jpg" }, trivia: "A lovely park." });
    expect(found.distance).toBeCloseTo(800, -1);
  });

  it("drops pages without coordinates and list-style articles", async () => {
    const fetcher = respond(wiki(page(1, 800, { coordinates: undefined }), page(2, 800, { title: "List of parks" }), page(3, 800, { title: "Main Street" }), page(4, 700)));
    const found = await wikipediaCandidates(origin, 1200, fetcher as unknown as typeof fetch);
    expect(found.map(c => c.id)).toEqual(["wiki-4"]);
  });
});

describe("OpenStreetMap candidates", () => {
  it("posts an Overpass query around the user with the same headers", async () => {
    const fetcher = respond(osm(element(9, 900), { type: "way", id: 10, center: { lat: north(650).lat, lon: north(650).lng }, tags: { name: "Rose Garden", leisure: "garden" } }, element(11, 700, { tourism: "viewpoint" })));
    const found = await openStreetMapCandidates(origin, 1100, fetcher as unknown as typeof fetch);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://overpass-api.de/api/interpreter");
    expect(init?.method).toBe("POST");
    expect(decodeURIComponent(String(init?.body))).toContain(`around:1100,${origin.lat},${origin.lng}`);
    expect((init?.headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT);
    expect(found.map(c => c.name)).toEqual(["Spot 9", "Rose Garden"]);
    expect(found[1]).toMatchObject({ id: "osm-way-10", neighborhood: "garden", thumbnail: null, source: "OpenStreetMap" });
  });
});

describe("picking a landmark", () => {
  const candidate = (id: string, meters: number, thumbnail: boolean): Candidate => ({ id, name: id, neighborhood: "", coords: north(meters), thumbnail: thumbnail ? { uri: id } : null, trivia: "", source: "Wikipedia", distance: meters });

  it("keeps to a 10–15 minute walk and favours ones with a photo", () => {
    const picked = pickLandmark([candidate("close", 120, true), candidate("far", 3000, true), candidate("bare", 780, false), candidate("photo", 900, true)], TARGET_BAND, () => 0);
    expect(picked).toMatchObject({ id: "photo", radiusMeters: 50 });
    expect(walkMinutesFor(550)).toBeGreaterThanOrEqual(10);
    expect(walkMinutesFor(900)).toBeLessThanOrEqual(15);
  });

  it("returns nothing when no candidate is inside the band", () => {
    expect(pickLandmark([candidate("close", 120, true)], TARGET_BAND)).toBeNull();
  });
});

describe("discoverLandmark", () => {
  it("uses Wikipedia first when it has something in range", async () => {
    const fetcher = respond(wiki(page(1, 800)));
    const found = await discoverLandmark(origin, fetcher as unknown as typeof fetch, () => 0);
    expect(found?.name).toBe("Place 1");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(distanceMeters(origin, found!.coords)).toBeCloseTo(800, -1);
  });

  it("falls back to OpenStreetMap when Wikipedia fails or is empty", async () => {
    const fetcher = respond(500, osm(element(5, 760)));
    expect((await discoverLandmark(origin, fetcher as unknown as typeof fetch, () => 0))?.name).toBe("Spot 5");
    const empty = respond(wiki(), osm(element(6, 760)));
    expect((await discoverLandmark(origin, empty as unknown as typeof fetch, () => 0))?.name).toBe("Spot 6");
  });

  it("widens the radius before giving up", async () => {
    const fetcher = respond(wiki(page(1, 200)), osm(), wiki(page(2, 1500)));
    const found = await discoverLandmark(origin, fetcher as unknown as typeof fetch, () => 0);
    expect(found?.name).toBe("Place 2");
    expect(fetcher.mock.calls[2][0]).toContain("ggsradius=2000");
  });

  it("returns null when nothing is walkable, even if the network fails", async () => {
    const fetcher = respond(new Error("offline"), osm(), wiki(page(1, 5000)), new Error("offline"));
    expect(await discoverLandmark(origin, fetcher as unknown as typeof fetch)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
