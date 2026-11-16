import { jest } from "@jest/globals";
import { act, render } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createLocalService } from "../services/localService";
import { memoryStorage } from "../services/memoryStorage";
import type { AnteService, Landmark } from "../services/types";
import { AnteProvider } from "../state/AnteProvider";

const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

export const ORIGIN = { lat: 37.7694, lng: -122.4862 };
export const LANDMARK: Landmark = {
  id: "wiki-42",
  name: "Old Mill Fountain",
  neighborhood: "Riverside park",
  coords: { lat: ORIGIN.lat + 0.0072, lng: ORIGIN.lng },
  thumbnail: null,
  trivia: "Pumped water for the mill until 1902.",
  source: "Wikipedia",
  radiusMeters: 50,
};

const reactions = () => ({ "🔥": [], "👏": [], "😂": [], "🫡": [] });

export const stampedToday = () => ({ id: "pc-1", memberId: "me", landmark: LANDMARK, photoUri: null, completedAt: Date.now() - 60 * 60_000, minutesTaken: 14, reactions: reactions() });

export type Seed = Record<string, unknown>;

export const currentAnte = () => jest.requireMock<{ __holder: { current: AnteService } }>("../services").__holder.current;

export function seedAnte(seed: Seed = {}) {
  const service = createLocalService({
    storage: memoryStorage(JSON.stringify({ onboarded: true, name: "Aahil Shaikh", group: { name: "", inviteCode: "HILL42", joined: false }, ...seed })),
    discover: async () => LANDMARK,
  });
  jest.requireMock<{ __holder: { current: AnteService } }>("../services").__holder.current = service;
  return service;
}

export async function renderApp(node: ReactNode, seed?: Seed) {
  await seedAnte(seed).load();
  const view = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AnteProvider>{node}</AnteProvider>
    </SafeAreaProvider>,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}
