export const DEFAULT_CONVEX_URL = "https://brilliant-crow-271.convex.cloud";

export function resolveConvexUrl({ url, offline }: { url?: string; offline?: string }) {
  if (offline === "1" || offline === "true") return null;
  return url?.trim() || DEFAULT_CONVEX_URL;
}
