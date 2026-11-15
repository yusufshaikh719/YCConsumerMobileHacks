import { describe, expect, it } from "@jest/globals";
import { fireEvent, screen } from "@testing-library/react-native";
import Feed from "../../app/feed";
import Join from "../../app/join/[code]";
import Passport from "../../app/passport";
import Settings from "../../app/settings";
import { ante } from "../services";
import { renderApp as wrap } from "./harness";

describe("secondary screens", () => {
  it("GROUP FEED shows the leaderboard and postcards, and reactions toggle", async () => {
    await wrap(<Feed />);
    expect(screen.getByText("This week")).toBeTruthy();
    expect(screen.getByText("Priya")).toBeTruthy();
    expect(screen.getAllByText("Grace Cathedral").length).toBeGreaterThan(0);
    const fire = screen.getAllByLabelText(/^React 🔥/)[0];
    await fireEvent.press(fire);
    const first = [...ante.getSnapshot().postcards].sort((a, b) => b.completedAt - a.completedAt)[0];
    expect(first.reactions["🔥"]).toContain("aahil");
  });

  it("PASSPORT shows your stamps for the week", async () => {
    await wrap(<Passport />);
    expect(screen.getByText("Aahil Shaikh")).toBeTruthy();
    expect(screen.getByText(/minutes walked to 3 landmarks/)).toBeTruthy();
  });

  it("SETTINGS edits the free window and saves it to the service", async () => {
    await wrap(<Settings />);
    expect(screen.getByText("3:00 PM")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("From earlier"));
    expect(screen.getByText("2:30 PM")).toBeTruthy();
    await fireEvent.press(screen.getByText("Save window"));
    expect(ante.getSnapshot().window.startMinute).toBe(14 * 60 + 30);
  });

  it("SETTINGS presets fill both ends", async () => {
    await wrap(<Settings />);
    await fireEvent.press(screen.getByText("Lunch"));
    expect(screen.getByText("12:00 PM")).toBeTruthy();
    expect(screen.getByText("2:00 PM")).toBeTruthy();
  });

  it("an invite link shows the group and pot", async () => {
    await wrap(<Join />);
    expect(screen.getByText("You're invited")).toBeTruthy();
    expect(screen.getByText("Join the group")).toBeTruthy();
  });
});
