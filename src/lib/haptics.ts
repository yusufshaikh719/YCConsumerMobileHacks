import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const safely = (run: () => Promise<void>) => {
  if (Platform.OS === "web") return;
  run().catch(() => undefined);
};

export const haptic = {
  slam: () => safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  tick: () => safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)),
  light: () => safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  success: () => safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  select: () => safely(() => Haptics.selectionAsync()),
};
