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
}));

jest.mock("../lib/position", () => ({
  useDevicePosition: () => ({ position: null, denied: false }),
  useHeading: () => 32,
}));

jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
}));
