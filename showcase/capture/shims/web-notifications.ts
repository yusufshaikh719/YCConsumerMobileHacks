// Capture-only: stands in for the app's src/lib/notifications.ts on web, where push notifications
// don't exist. It reports notifications as allowed, the way a phone that granted permission would,
// so the Waiting screen renders without its "Turn on notifications" prompt.
export async function enableNotifications() {
  return true;
}

export async function notificationsGranted() {
  return true;
}

export async function schedulePing(_pingAt: number) {}

export async function cancelPing() {}

export function onPingNotification(_handler: (pingAt: number) => void) {
  return () => undefined;
}
