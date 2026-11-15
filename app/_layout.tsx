import { Stack } from "expo-router";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { StatusBar } from "expo-status-bar";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL || "https://brilliant-crow-271.convex.cloud");

export default function RootLayout() {
  return <ConvexProvider client={convex}><StatusBar style="light" /><Stack screenOptions={{ headerShown: false }} /></ConvexProvider>;
}
