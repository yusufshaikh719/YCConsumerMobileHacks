import type * as NotificationsModule from "expo-notifications";
import { Platform } from "react-native";
import { optionalNative } from "./native";

const CHANNEL = "sidequest";

let handlerSet = false;
const loadNotifications = optionalNative(
  [
    "ExpoApplication",
    "ExpoPushTokenManager",
    "ExpoBackgroundNotificationTasksModule",
    "ExpoBadgeModule",
    "ExpoNotificationCategoriesModule",
    "ExpoNotificationChannelGroupManager",
    "ExpoNotificationChannelManager",
    "ExpoNotificationPermissionsModule",
    "ExpoNotificationPresenter",
    "ExpoNotificationScheduler",
    "ExpoNotificationsEmitter",
    "ExpoNotificationsHandlerModule",
    "NotificationsServerRegistrationModule",
  ],
  () => require("expo-notifications") as typeof NotificationsModule,
);

function notifications() {
  if (Platform.OS === "web") return null;
  const Notifications = loadNotifications();
  if (Notifications && !handlerSet) {
    handlerSet = true;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
  }
  return Notifications;
}

export const notificationsAvailable = () => notifications() !== null;

export async function enableNotifications() {
  const Notifications = notifications();
  if (!Notifications) return false;
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
  const Notifications = notifications();
  if (!Notifications) return false;
  return Notifications.getPermissionsAsync().then(p => p.granted).catch(() => false);
}

export async function schedulePing(pingAt: number) {
  const Notifications = notifications();
  if (!Notifications) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: { title: "Sidequest in 1 minute", body: "Shoes on. Your landmark drops at zero.", data: { pingAt }, sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(pingAt), channelId: CHANNEL },
  });
}

export async function cancelPing() {
  await notifications()?.cancelAllScheduledNotificationsAsync().catch(() => undefined);
}

function scheduledPingAt(notification: NotificationsModule.Notification) {
  const value = notification.request.content.data?.pingAt;
  return typeof value === "number" ? value : null;
}

export function onPingNotification(handler: (pingAt: number) => void) {
  const Notifications = notifications();
  if (!Notifications) return () => undefined;
  const handle = (notification: NotificationsModule.Notification) => {
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
