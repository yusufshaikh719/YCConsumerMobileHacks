import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

export function optionalNative<T>(modules: string[], load: () => T): () => T | null {
  let cached: T | null | undefined;
  return () => {
    if (cached !== undefined) return cached;
    try {
      cached = Platform.OS === "web" || modules.every(name => requireOptionalNativeModule(name)) ? load() : null;
    } catch {
      cached = null;
    }
    return cached;
  };
}
