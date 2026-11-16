import { optionalNative } from "../lib/native";

const loadFileSystem = optionalNative(["FileSystem"], () => require("expo-file-system") as typeof import("expo-file-system"));

export interface Storage {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
  keepPhoto(uri: string, id: string): Promise<string>;
}

export function deviceStorage(fileName = "ante-state.json"): Storage {
  const state = () => {
    const fs = loadFileSystem();
    return fs ? new fs.File(fs.Paths.document, fileName) : null;
  };
  return {
    async read() {
      const file = state();
      if (!file) return null;
      return file.exists ? await file.text() : null;
    },
    async write(text) {
      const file = state();
      if (!file) return;
      if (!file.exists) file.create();
      file.write(text);
    },
    async keepPhoto(uri, id) {
      const fs = loadFileSystem();
      if (!fs) return uri;
      const { Directory, File, Paths } = fs;
      const dir = new Directory(Paths.document, "postcards");
      if (!dir.exists) dir.create();
      const target = new File(dir, `${id}.jpg`);
      if (target.exists) target.delete();
      new File(uri).copy(target);
      return target.uri;
    },
  };
}
