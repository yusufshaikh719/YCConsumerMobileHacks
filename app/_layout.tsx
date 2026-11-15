import { Stack } from "expo-router";
import { ConvexProvider, ConvexReactClient } from "convex/react";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export default function RootLayout() {
  const routes = <Stack />;
  return convex ? <ConvexProvider client={convex}>{routes}</ConvexProvider> : routes;
}
