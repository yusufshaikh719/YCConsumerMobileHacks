import { Platform } from "react-native";
import { optionalNative } from "./native";

type Haptics = typeof import("expo-haptics");

const loadHaptics = optionalNative(["ExpoHaptics"], () => require("expo-haptics") as Haptics);

const safely = (run: (haptics: Haptics) => Promise<void>) => {
  if (Platform.OS === "web") return;
  const haptics = loadHaptics();
  if (haptics) run(haptics).catch(() => undefined);
};

export const haptic = {
  slam: () => safely(h => h.impactAsync(h.ImpactFeedbackStyle.Heavy)),
  tick: () => safely(h => h.impactAsync(h.ImpactFeedbackStyle.Rigid)),
  light: () => safely(h => h.impactAsync(h.ImpactFeedbackStyle.Light)),
  success: () => safely(h => h.notificationAsync(h.NotificationFeedbackType.Success)),
  warning: () => safely(h => h.notificationAsync(h.NotificationFeedbackType.Warning)),
  select: () => safely(h => h.selectionAsync()),
};
