import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const CHANNEL = "sidequest";
const supported = Platform.OS !== "web";

if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

export async function enableNotifications() {
  if (!supported) return false;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: "Sidequests",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 150, 400],
        lightColor: "#2FA052",
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function notificationsGranted() {
  if (!supported) return false;
  return Notifications.getPermissionsAsync().then(p => p.granted).catch(() => false);
}

export async function schedulePing(pingAt: number) {
  if (!supported) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: { title: "Sidequest in 1 minute", body: "Shoes on. Your landmark drops at zero.", data: { pingAt }, sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(pingAt), channelId: CHANNEL },
  });
}

export async function cancelPing() {
  if (supported) await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
}

function scheduledPingAt(notification: Notifications.Notification) {
  const value = notification.request.content.data?.pingAt;
  return typeof value === "number" ? value : null;
}

export function onPingNotification(handler: (pingAt: number) => void) {
  if (!supported) return () => undefined;
  const handle = (notification: Notifications.Notification) => {
    const pingAt = scheduledPingAt(notification);
    if (pingAt) handler(pingAt);
  };
  void Notifications.getLastNotificationResponseAsync().then(response => response && handle(response.notification)).catch(() => undefined);
  const received = Notifications.addNotificationReceivedListener(handle);
  const opened = Notifications.addNotificationResponseReceivedListener(response => handle(response.notification));
  return () => {
    received.remove();
    opened.remove();
  };
}
