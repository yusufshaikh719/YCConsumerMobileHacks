import type { LatLng } from "../services/types";

const EARTH_RADIUS_M = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function distanceMeters(a: LatLng, b: LatLng) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function bearingDegrees(from: LatLng, to: LatLng) {
  const y = Math.sin(rad(to.lng - from.lng)) * Math.cos(rad(to.lat));
  const x = Math.cos(rad(from.lat)) * Math.sin(rad(to.lat)) - Math.sin(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.cos(rad(to.lng - from.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function stepToward(from: LatLng, to: LatLng, meters: number): LatLng {
  const total = distanceMeters(from, to);
  if (total <= meters || total === 0) return to;
  const t = meters / total;
  return { lat: from.lat + (to.lat - from.lat) * t, lng: from.lng + (to.lng - from.lng) * t };
}

export function formatDistance(meters: number) {
  if (meters < 1000) return { value: String(Math.max(0, Math.round(meters / 10) * 10)), unit: "m" };
  return { value: (meters / 1000).toFixed(1), unit: "km" };
}
