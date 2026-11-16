import { describe, expect, it, jest } from "@jest/globals";
import { screen } from "@testing-library/react-native";
import type * as Harness from "./harness";

jest.unmock("../lib/notifications");
jest.unmock("../lib/position");
jest.unmock("expo-camera");

const ROUTES = ["../../app/_layout", "../../app/index", "../../app/feed", "../../app/passport", "../../app/settings", "../../app/onboarding", "../../app/join/[code]"];
const MODULES = ["ExpoApplication", "ExpoPushTokenManager", "ExpoNotificationScheduler", "ExpoNotificationsEmitter", "ExpoHaptics", "ExpoLocation", "ExpoCamera", "FileSystem"];

function withoutNativeModules(missing: string[]) {
  const core = jest.requireMock<Record<string, (name: string) => unknown>>("expo-modules-core");
  const optional = core.requireOptionalNativeModule;
  core.requireOptionalNativeModule = name => (missing.includes(name) ? null : optional(name));
  core.requireNativeModule = name => {
    const found = core.requireOptionalNativeModule(name);
    if (!found) throw new Error(`Cannot find native module '${name}'`);
    return found;
  };
}

describe("with every optional native module missing", () => {
  it("renders the home screen and says notifications are unavailable", async () => {
    withoutNativeModules(MODULES);
    expect(() => require("expo-notifications")).toThrow(/Cannot find native module/);
    const { renderApp } = require("./harness") as typeof Harness;
    const Home = (require("../../app/index") as { default: () => React.JSX.Element }).default;
    await renderApp(<Home />);
    expect(await screen.findByText("This week's pot")).toBeTruthy();
    expect(await screen.findByText("Notifications aren't available in this build")).toBeTruthy();
    expect(screen.queryByText("Turn on notifications")).toBeNull();
  });
});

describe.each(MODULES)("without the %s native module", missing => {
  it("loads app/_layout and every route", () => {
    jest.resetModules();
    withoutNativeModules([missing]);
    for (const route of ROUTES) expect((require(route) as { default: unknown }).default).toBeTruthy();
  });
});
