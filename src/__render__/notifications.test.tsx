import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type * as Lib from "../lib/notifications";

jest.unmock("../lib/notifications");

describe("local notifications without ExpoApplication", () => {
  let lib: typeof Lib;
  let scheduler: Record<string, jest.Mock>;
  let permissions: Record<string, jest.Mock>;

  beforeEach(() => {
    jest.resetModules();
    const core = jest.requireMock<Record<string, (name: string) => unknown>>("expo-modules-core");
    const optional = core.requireOptionalNativeModule;
    core.requireOptionalNativeModule = name => (name === "ExpoApplication" || name === "ExpoPushTokenManager" ? null : optional(name));
    core.requireNativeModule = name => {
      const found = core.requireOptionalNativeModule(name);
      if (!found) throw new Error(`Cannot find native module '${name}'`);
      return found;
    };
    lib = require("../lib/notifications");
    expect(lib.notificationsAvailable()).toBe(true);
    scheduler = require("expo-notifications/build/NotificationScheduler").default;
    permissions = require("expo-notifications/build/NotificationPermissionsModule").default;
  });

  it("never loads expo-notifications' index, so the push-token chain can't crash launch", () => {
    expect(() => require("expo-notifications")).toThrow(/Cannot find native module/);
  });

  it("schedules the ping as a DATE trigger on the sidequest channel", async () => {
    const pingAt = Date.now() + 60_000;
    await lib.schedulePing(pingAt);
    expect(scheduler.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    const [, content, trigger] = scheduler.scheduleNotificationAsync.mock.calls[0] as [string, { title: string; data: unknown }, Record<string, unknown>];
    expect(content).toMatchObject({ title: "Sidequest in 1 minute", data: { pingAt } });
    expect(trigger).toMatchObject({ type: "date", timestamp: pingAt, channelId: "sidequest" });
  });

  it("treats a granted status as enabled without prompting again", async () => {
    permissions.getPermissionsAsync.mockImplementation(async () => ({ status: "granted", granted: false, canAskAgain: true, expires: "never" }));
    await expect(lib.enableNotifications()).resolves.toBe(true);
    expect(permissions.requestPermissionsAsync).not.toHaveBeenCalled();
  });

});
