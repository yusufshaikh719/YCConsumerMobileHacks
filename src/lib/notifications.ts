import type { Notification } from "expo-notifications";
import { Platform } from "react-native";
import { optionalNative } from "./native";

const CHANNEL = "sidequest";

type Api = {
  permissions: typeof import("expo-notifications/build/NotificationPermissions");
  handler: typeof import("expo-notifications/build/NotificationsHandler");
  emitter: typeof import("expo-notifications/build/NotificationsEmitter");
  schedule: typeof import("expo-notifications/build/scheduleNotificationAsync");
  cancelAll: typeof import("expo-notifications/build/cancelAllScheduledNotificationsAsync");
  channel: typeof import("expo-notifications/build/setNotificationChannelAsync");
  types: typeof import("expo-notifications/build/Notifications.types");
  channelTypes: typeof import("expo-notifications/build/NotificationChannelManager.types");
};

const loadNotifications = optionalNative(
  ["ExpoNotificationPermissionsModule", "ExpoNotificationsHandlerModule", "ExpoNotificationsEmitter", "ExpoNotificationScheduler", ...(Platform.OS === "android" ? ["ExpoNotificationChannelManager"] : [])],
  (): Api => {
    const api: Api = {
      permissions: require("expo-notifications/build/NotificationPermissions"),
      handler: require("expo-notifications/build/NotificationsHandler"),
      emitter: require("expo-notifications/build/NotificationsEmitter"),
      schedule: require("expo-notifications/build/scheduleNotificationAsync"),
      cancelAll: require("expo-notifications/build/cancelAllScheduledNotificationsAsync"),
      channel: require("expo-notifications/build/setNotificationChannelAsync"),
      types: require("expo-notifications/build/Notifications.types"),
      channelTypes: require("expo-notifications/build/NotificationChannelManager.types"),
    };
    try {
      api.handler.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
      });
    } catch {}
    return api;
  },
);

const notifications = () => (Platform.OS === "web" ? null : loadNotifications());

export const notificationsAvailable = () => notifications() !== null;

const isGranted = (p: { granted: boolean; status: string }) => p.granted || p.status === "granted";

async function ensureChannel(api: Api) {
  if (Platform.OS !== "android") return;
  await api.channel
    .setNotificationChannelAsync(CHANNEL, {
      name: "Sidequests",
      importance: api.channelTypes.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 150, 400],
      lightColor: "#2FA052",
    })
    .catch(() => undefined);
}

export async function enableNotifications() {
  const api = notifications();
  if (!api) return false;
  try {
    await ensureChannel(api);
    if (isGranted(await api.permissions.getPermissionsAsync())) return true;
    return isGranted(await api.permissions.requestPermissionsAsync());
  } catch {
    return false;
  }
}

export async function notificationsGranted() {
  const api = notifications();
  if (!api) return false;
  return api.permissions.getPermissionsAsync().then(isGranted).catch(() => false);
}

export async function schedulePing(pingAt: number) {
  const api = notifications();
  if (!api) return;
  await ensureChannel(api);
  await api.cancelAll.cancelAllScheduledNotificationsAsync();
  await api.schedule.scheduleNotificationAsync({
    content: { title: "Sidequest in 1 minute", body: "Shoes on. Your landmark drops at zero.", data: { pingAt }, sound: true },
    trigger: { type: api.types.SchedulableTriggerInputTypes.DATE, date: new Date(pingAt), channelId: CHANNEL },
  });
}

export async function cancelPing() {
  await notifications()?.cancelAll.cancelAllScheduledNotificationsAsync().catch(() => undefined);
}

function scheduledPingAt(notification: Notification) {
  const value = notification.request.content.data?.pingAt;
  return typeof value === "number" ? value : null;
}

export function onPingNotification(handler: (pingAt: number) => void) {
  const api = notifications();
  if (!api) return () => undefined;
  const handle = (notification: Notification) => {
    const pingAt = scheduledPingAt(notification);
    if (pingAt) handler(pingAt);
  };
  const open = (notification: Notification) => {
    handle(notification);
    try {
      api.emitter.clearLastNotificationResponse();
    } catch {}
  };
  try {
    const last = api.emitter.getLastNotificationResponse();
    if (last) open(last.notification);
  } catch {}
  const received = api.emitter.addNotificationReceivedListener(handle);
  const opened = api.emitter.addNotificationResponseReceivedListener(response => open(response.notification));
  return () => {
    received.remove();
    opened.remove();
  };
}
