import { jest } from "@jest/globals";
jest.mock("expo-router", () => {
  const router = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => false, canDismiss: () => false, dismissAll: jest.fn() };
  return { router, useRouter: () => router, useLocalSearchParams: () => ({ code: "HILL42" }) };
});

jest.mock("../lib/notifications", () => ({
  enableNotifications: jest.fn(async () => true),
  schedulePing: jest.fn(async () => undefined),
  cancelPing: jest.fn(async () => undefined),
  onPingNotification: jest.fn(() => () => undefined),
  notificationsGranted: jest.fn(async () => false),
  notificationsAvailable: () => true,
}));

jest.mock("../lib/position", () => ({
  useDevicePosition: () => ({ position: null, denied: false }),
  useHeading: () => 32,
  locationAvailable: () => true,
  getCurrentFix: jest.fn(async () => ({ fix: { lat: 37.7694, lng: -122.4862, accuracy: 10 } })),
}));

jest.mock("../lib/maps", () => ({
  ...jest.requireActual<typeof import("../lib/maps")>("../lib/maps"),
  loadMaps: () => jest.requireMock("react-native-maps"),
}));

jest.mock("react-native-maps", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  const MapView = ({ children }: { children?: unknown }) => React.createElement(View, { testID: "quest-map" }, children as never);
  return { __esModule: true, default: MapView, Marker: () => null, Polyline: () => null };
});

jest.mock("../services", () => {
  const holder: { current: Record<string, unknown> } = { current: {} };
  return { __holder: holder, ante: new Proxy({}, { get: (_target, key) => holder.current[key as string] }) };
});

jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
}));
