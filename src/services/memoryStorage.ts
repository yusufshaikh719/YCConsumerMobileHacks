import type { Storage } from "./storage";

export function memoryStorage(initial: string | null = null): Storage & { text: string | null } {
  const store = {
    text: initial,
    async read() {
      return store.text;
    },
    async write(text: string) {
      store.text = text;
    },
    async keepPhoto(uri: string) {
      return uri;
    },
  };
  return store;
}
