import { optionalNative } from "./native";

export const loadCamera = optionalNative(["ExpoCamera"], () => require("expo-camera") as typeof import("expo-camera"));
