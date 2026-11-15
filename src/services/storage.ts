import { Directory, File, Paths } from "expo-file-system";

export interface Storage {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
  keepPhoto(uri: string, id: string): Promise<string>;
}

export function deviceStorage(fileName = "ante-state.json"): Storage {
  const state = () => new File(Paths.document, fileName);
  return {
    async read() {
      const file = state();
      return file.exists ? await file.text() : null;
    },
    async write(text) {
      const file = state();
      if (!file.exists) file.create();
      file.write(text);
    },
    async keepPhoto(uri, id) {
      const dir = new Directory(Paths.document, "postcards");
      if (!dir.exists) dir.create();
      const target = new File(dir, `${id}.jpg`);
      if (target.exists) target.delete();
      new File(uri).copy(target);
      return target.uri;
    },
  };
}
