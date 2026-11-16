import { describe, expect, it } from "@jest/globals";
import { act, fireEvent, screen } from "@testing-library/react-native";
import Feed from "../../app/feed";
import Join from "../../app/join/[code]";
import Passport from "../../app/passport";
import Settings from "../../app/settings";
import { Onboarding } from "../screens/Onboarding";
import { ante } from "../services";
import { renderApp as wrap, stampedToday } from "./harness";

describe("secondary screens", () => {
  it("ONBOARDING in offline mode says so and won't fake-join a friend's code", async () => {
    await wrap(<Onboarding inviteCode="LEBHPI" onDone={() => undefined} />);
    expect(screen.getByText("Offline mode: not synced")).toBeTruthy();
    await fireEvent.press(screen.getByText("Next: fund the pot"));
    expect(screen.getByText(/^We couldn't find that group/)).toBeTruthy();
    expect(ante.getSnapshot().group.inviteCode).toBe("HILL42");
  });

  it("GROUP FEED with nobody else shows you, an invite card, and an empty postcard state", async () => {
    await wrap(<Feed />);
    expect(screen.getByText("This week")).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.getByText("Nobody to race yet")).toBeTruthy();
    expect(screen.getByText("No postcards this week")).toBeTruthy();
  });

  it("GROUP FEED shows your real postcards, and reactions toggle", async () => {
    await wrap(<Feed />, { postcards: [stampedToday()] });
    expect(screen.getAllByText("Old Mill Fountain").length).toBeGreaterThan(0);
    expect(screen.queryByText("No postcards this week")).toBeNull();
    await fireEvent.press(screen.getAllByLabelText(/^React 🔥/)[0]);
    expect(ante.getSnapshot().postcards[0].reactions["🔥"]).toContain("me");
  });

  it("PASSPORT shows your name and stamps for the week", async () => {
    await wrap(<Passport />, { postcards: [stampedToday()] });
    expect(screen.getByText("Aahil Shaikh")).toBeTruthy();
    expect(screen.getByText("14 minutes walked to 1 landmark this week.")).toBeTruthy();
  });

  it("PASSPORT starts empty", async () => {
    await wrap(<Passport />);
    expect(screen.getByText(/No stamps yet/)).toBeTruthy();
  });

  it("SETTINGS edits a window and saves it to the service", async () => {
    await wrap(<Settings />);
    expect(screen.getByText("3:00 PM")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("From earlier"));
    expect(screen.getByText("2:30 PM")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText("Save"));
    });
    expect(ante.getSnapshot().windows).toEqual([{ startMinute: 14 * 60 + 30, endMinute: 18 * 60 }]);
  });

  it("SETTINGS adds and removes slots, and never lets them overlap", async () => {
    await wrap(<Settings />);
    await fireEvent.press(screen.getByText("Add another window"));
    expect(screen.getByLabelText("Edit window 7:00 PM – 9:00 PM")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("From earlier"));
    await fireEvent.press(screen.getByLabelText("From earlier"));
    expect(screen.getByLabelText("Edit window 6:00 PM – 9:00 PM")).toBeTruthy();
    expect(screen.getByLabelText("From earlier")).toBeDisabled();
    expect(screen.getByText("After work")).toBeTruthy();
    await fireEvent.press(screen.getByText("After work"));
    expect(screen.getByLabelText("Edit window 6:00 PM – 9:00 PM")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText("Save"));
    });
    expect(ante.getSnapshot().windows).toEqual([{ startMinute: 900, endMinute: 1080 }, { startMinute: 1080, endMinute: 1260 }]);
  });

  it("SETTINGS removes a slot and saves your name", async () => {
    await wrap(<Settings />, { windows: [{ startMinute: 720, endMinute: 780 }, { startMinute: 900, endMinute: 1080 }] });
    await fireEvent.press(screen.getByLabelText("Remove window 12:00 PM – 1:00 PM"));
    expect(screen.queryByLabelText(/^Remove window/)).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("Your name"), "Yusuf Shaikh");
    await act(async () => {
      fireEvent.press(screen.getByText("Save"));
    });
    expect(ante.getSnapshot().windows).toEqual([{ startMinute: 900, endMinute: 1080 }]);
    expect(ante.getSnapshot().group.name).toBe("Yusuf's group");
  });

  it("SETTINGS presets fill both ends", async () => {
    await wrap(<Settings />);
    await fireEvent.press(screen.getByText("Lunch"));
    expect(screen.getByText("12:00 PM")).toBeTruthy();
    expect(screen.getByText("2:00 PM")).toBeTruthy();
  });

  it("SETTINGS links back into group setup", async () => {
    await wrap(<Settings />);
    expect(screen.getByText("Aahil's group")).toBeTruthy();
    expect(screen.getByLabelText("Change group")).toBeTruthy();
  });

  it("your own invite link offers to share it", async () => {
    await wrap(<Join />);
    expect(screen.getByText("Your invite")).toBeTruthy();
    expect(screen.getByText("Share invite")).toBeTruthy();
  });

  it("someone else's invite link leads into joining", async () => {
    await wrap(<Join />, { group: { name: "", inviteCode: "ZZZ999", joined: false } });
    expect(screen.getByText("You're invited")).toBeTruthy();
    expect(screen.getByText("Group HILL42")).toBeTruthy();
    expect(screen.getByText("Join this group")).toBeTruthy();
  });
});
