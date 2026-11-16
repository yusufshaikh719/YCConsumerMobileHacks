// Capture-only stand-in for expo-file-system on web: an in-memory store with the same
// File/Directory/Paths surface the app uses. Photos keep their data: or blob: URL so they render.
const files = new Map();

const media = uri => typeof uri === "string" && /^(data|blob):/.test(uri);
const join = parts => (parts.length === 1 && media(parts[0]) ? parts[0] : parts.map(p => (typeof p === "string" ? p : p.path)).join("/").replace(/\/+/g, "/"));

export const Paths = { document: "memory://document", cache: "memory://cache" };

export class Directory {
  constructor(...parts) { this.path = join(parts); this.uri = this.path; }
  get exists() { return [...files.keys()].some(key => key.startsWith(this.path + "/")) || files.has(this.path + "/"); }
  create() { files.set(this.path + "/", ""); }
}

export class File {
  constructor(...parts) { this.path = join(parts); }
  get uri() { const stored = files.get(this.path); return media(stored) ? stored : this.path; }
  get exists() { return media(this.path) || files.has(this.path); }
  create() { if (!files.has(this.path)) files.set(this.path, ""); }
  write(text) { files.set(this.path, text); }
  async text() { return files.get(this.path) ?? ""; }
  delete() { files.delete(this.path); }
  copy(target) { files.set(target.path, media(this.path) ? this.path : files.get(this.path) ?? ""); }
}
