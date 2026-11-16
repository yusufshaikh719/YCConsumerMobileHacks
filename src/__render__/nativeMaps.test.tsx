import { describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { QuestMap } from "../components/QuestMap";

jest.unmock("react-native-maps");
jest.unmock("../lib/maps");

describe("without the react-native-maps native module", () => {
  it("importing react-native-maps directly would throw, which is what crashed Expo Go", () => {
    expect(() => jest.requireActual("react-native-maps")).toThrow(/RNMapsAirModule/);
  });

  it("still loads every route", () => {
    for (const route of ["../../app/_layout", "../../app/index", "../../app/feed", "../../app/passport", "../../app/settings", "../../app/onboarding", "../../app/join/[code]"]) {
      expect((require(route) as { default: unknown }).default).toBeTruthy();
    }
  });

  it("the map falls back to walking directions", async () => {
    await render(<QuestMap you={{ lat: 1, lng: 1 }} target={{ lat: 1.007, lng: 1 }} title="Old Mill" />);
    expect(screen.getByText("The map isn't available in this build")).toBeTruthy();
    expect(screen.getByText("Open in Maps")).toBeTruthy();
  });
});
