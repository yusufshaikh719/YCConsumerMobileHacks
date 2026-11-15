import { Stack } from "expo-router";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { FONT_ASSETS, FontLoadedContext } from "../src/ui/fonts";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL || "https://brilliant-crow-271.convex.cloud");

export default function RootLayout() {
  const [loaded] = useFonts(FONT_ASSETS);
  return <FontLoadedContext.Provider value={loaded}><ConvexProvider client={convex}><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, title: "Ante" }} /></ConvexProvider></FontLoadedContext.Provider>;
}
