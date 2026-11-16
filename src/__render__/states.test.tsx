import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import Home from "../../app/index";
import { enableNotifications, notificationsGranted } from "../lib/notifications";
import { getCurrentFix } from "../lib/position";
import { ante } from "../services";
import { YC_HQ } from "../dev/devQuest";
import { useAnte, type DevTarget } from "../state/AnteProvider";
import { currentAnte, LANDMARK, ORIGIN, renderApp, stampedToday, type Seed } from "./harness";

let jump: (target: DevTarget) => Promise<void>;

function Probe() {
  const ante = useAnte();
  useEffect(() => {
    jump = ante.jump;
  });
  return null;
}

const settle = () => act(async () => {
  await jest.advanceTimersByTimeAsync(50);
});

async function renderAt(target?: DevTarget, seed?: Seed) {
  await renderApp(
    <>
      <Probe />
      <Home />
    </>,
    seed,
  );
  if (target) await act(async () => {
    const pending = jump(target);
    await jest.advanceTimersByTimeAsync(3000);
    await pending;
  });
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 10, 15, 16, 0) });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("home renders the current state", () => {
  it("WAITING inside the window is armed, shows only real data, and invites friends when alone", async () => {
    await renderAt("waiting-open");
    expect(screen.getByText("Could be any minute.")).toBeTruthy();
    expect(screen.getAllByText("$20").length).toBeGreaterThan(0);
    expect(screen.getByText(/Just you so far, with 0 stamps/)).toBeTruthy();
    expect(screen.getByText("Better with friends")).toBeTruthy();
    expect(screen.getByText("Invite friends")).toBeTruthy();
    expect(screen.getByText("Your first stamp of the day lands here.")).toBeTruthy();
    expect(screen.queryByText(/\d:\d\d (AM|PM)/)).toBeNull();
  });

  it("WAITING shows today's own postcard", async () => {
    await renderAt("waiting-open", { postcards: [stampedToday()] });
    expect(screen.getByText("Old Mill Fountain")).toBeTruthy();
    expect(screen.getByText(/Just you so far, with 1 stamp\b/)).toBeTruthy();
  });

  it("WAITING outside the window says when the window opens", async () => {
    await renderAt("waiting-closed");
    expect(screen.getByText("Window opens 3:00 PM")).toBeTruthy();
  });

  it("WAITING with several slots is armed when any is active, and names the next slot's start", async () => {
    const windows = [{ startMinute: 12 * 60, endMinute: 13 * 60 }, { startMinute: 17 * 60, endMinute: 19 * 60 }];
    await renderAt(undefined, { windows });
    expect(screen.getByText("Window opens 5:00 PM")).toBeTruthy();
    expect(screen.getByText("Your next sidequest window opens later today.")).toBeTruthy();
    await renderAt(undefined, { windows: [{ startMinute: 12 * 60, endMinute: 13 * 60 }, { startMinute: 15 * 60 + 30, endMinute: 17 * 60 }] });
    expect(screen.getByText("Could be any minute.")).toBeTruthy();
  });

  it("PING shows the countdown and hides the destination", async () => {
    await renderAt("ping");
    expect(screen.getByText("Shoes on.")).toBeTruthy();
    expect(screen.getByLabelText(/^\d+ seconds$/)).toBeTruthy();
    expect(screen.queryByText(LANDMARK.name)).toBeNull();
  });

  it("PING turns into QUEST LIVE at zero, with a landmark found near the real position", async () => {
    await renderAt("ping");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(61_000);
    });
    expect(screen.getByText(LANDMARK.name)).toBeTruthy();
    expect(getCurrentFix).toHaveBeenCalled();
  });

  it("QUEST LIVE from the dev switcher heads to Y Combinator, with distance, landmark card, a Map toggle, and no camera button", async () => {
    await renderAt("live");
    expect(screen.getByText("Y Combinator")).toBeTruthy();
    expect(screen.getByLabelText("740 meters to go")).toBeTruthy();
    expect(screen.getByText(/About 13 min on foot/)).toBeTruthy();
    expect(screen.getByText(YC_HQ.trivia)).toBeTruthy();
    expect(screen.queryByLabelText("Take selfie")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Show map"));
    expect(screen.getByTestId("quest-map")).toBeTruthy();
    expect(screen.getByLabelText("Show compass")).toBeTruthy();
  });

  it("ARRIVED becomes the selfie camera with the landmark hint", async () => {
    await renderAt("arrived");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText("Get Y Combinator behind you.")).toBeTruthy();
    expect(screen.getByLabelText("Take selfie")).toBeTruthy();
  });

  it("VERIFIED from the dev switcher stamps Y Combinator at its entrance", async () => {
    jest.mocked(getCurrentFix).mockClear();
    await renderAt("verified");
    expect(screen.getByText("Stamp collected")).toBeTruthy();
    expect(screen.getByText("Y Combinator")).toBeTruthy();
    expect(ante.getSnapshot().postcards[0].landmark).toMatchObject({ name: "Y Combinator", coords: { lat: 37.76071, lng: -122.38602 } });
    expect(getCurrentFix).not.toHaveBeenCalled();
  });

  it("VERIFYING at the landmark stamps a postcard and nudges a solo player to invite", async () => {
    jest.mocked(getCurrentFix).mockResolvedValueOnce({ fix: { ...YC_HQ.coords, accuracy: 8 } });
    await renderAt("verifying");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByText("Stamp collected")).toBeTruthy();
    expect(screen.getByText("Make it a race")).toBeTruthy();
    expect(screen.queryByText(/You passed/)).toBeNull();
    expect(ante.getSnapshot().postcards).toHaveLength(1);
    expect(screen.getByText("Back to waiting")).toBeTruthy();
  });

  it("VERIFYING away from the landmark is not verified", async () => {
    await renderAt("verifying");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByText("We couldn't confirm you're there.")).toBeTruthy();
    expect(ante.getSnapshot().postcards).toHaveLength(0);
  });

  it("TIME'S UP is gentle and goes back to waiting", async () => {
    await renderAt("failed");
    expect(screen.getByText("This one got away.")).toBeTruthy();
    expect(screen.getByText(/next window opens at 3:00 PM/)).toBeTruthy();
    expect(screen.queryByText("Take another selfie")).toBeNull();
    await fireEvent.press(screen.getByText("Back to waiting"));
    expect(screen.getByText("Aahil's group ›")).toBeTruthy();
  });

  it("NOT VERIFIED offers a retake while time remains", async () => {
    await renderAt("not-verified");
    await fireEvent.press(screen.getByText("Take another selfie"));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByLabelText("Take selfie")).toBeTruthy();
  });

  it("no location: explains why and offers Settings", async () => {
    jest.mocked(getCurrentFix).mockResolvedValueOnce({ denied: true });
    await renderAt("ping");
    expect(screen.getByText("We need to know where you are.")).toBeTruthy();
    expect(screen.getByText("Open Settings")).toBeTruthy();
  });

  it("no landmark nearby: skips the day without penalty", async () => {
    await renderAt();
    jest.spyOn(currentAnte(), "startSidequest").mockRejectedValueOnce(new Error("none"));
    await act(async () => {
      const pending = jump("ping");
      await jest.advanceTimersByTimeAsync(3000);
      await pending;
    });
    expect(screen.getByText("No landmark within a short walk.")).toBeTruthy();
    expect(screen.getByText(/no penalty/)).toBeTruthy();
  });
});

describe("onboarding gate", () => {
  it("first run asks for a group, then windows, then lands on waiting", async () => {
    await renderAt(undefined, { onboarded: false, name: "" });
    expect(screen.getByText("Pick your crew.")).toBeTruthy();
    expect(screen.queryByText("Could be any minute.")).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("Your name"), "Maya Lin");
    await fireEvent.changeText(screen.getByLabelText("Group name"), "Lunch Walkers");
    await fireEvent.press(screen.getByText("Next: your windows"));
    await settle();
    expect(screen.getByText("When are you free?")).toBeTruthy();
    await fireEvent.press(screen.getByText("Add another window"));
    await fireEvent.press(screen.getByText("Start playing"));
    await settle();
    expect(screen.getByText("Could be any minute.")).toBeTruthy();
    expect(screen.getByText("Lunch Walkers ›")).toBeTruthy();
    expect(ante.getSnapshot()).toMatchObject({ onboarded: true, windows: [{ startMinute: 900, endMinute: 1080 }, { startMinute: 1140, endMinute: 1260 }] });
    expect(ante.getSnapshot().group.members[0].fullName).toBe("Maya Lin");
  });

  it("joining needs a real-looking invite code", async () => {
    await renderAt(undefined, { onboarded: false });
    await fireEvent.press(screen.getByText("Join with a code"));
    await fireEvent.changeText(screen.getByLabelText("Invite code"), "??");
    await fireEvent.press(screen.getByText("Next: your windows"));
    await settle();
    expect(screen.getByText(/doesn't look like an invite code/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Invite code"), "ante://join/ab12cd");
    await fireEvent.press(screen.getByText("Next: your windows"));
    await settle();
    expect(screen.getByText("When are you free?")).toBeTruthy();
    expect(ante.getSnapshot().group).toMatchObject({ inviteCode: "AB12CD", joined: true });
  });

  it("doesn't arm a ping until onboarding is done", async () => {
    await renderAt(undefined, { onboarded: false });
    expect(ante.getSnapshot().nextPingAt).toBeNull();
  });
});

describe("notification permission", () => {
  it("WAITING explains why notifications matter when they are off", async () => {
    jest.mocked(enableNotifications).mockResolvedValueOnce(false);
    await renderAt("waiting-open");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByText("Turn on notifications")).toBeTruthy();
  });

  it("hides the card when the user comes back from Settings with notifications on", async () => {
    const listeners: ((state: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, "addEventListener").mockImplementation((type, listener) => {
      if (type === "change") listeners.push(listener as (state: AppStateStatus) => void);
      return { remove: () => undefined };
    });
    jest.mocked(enableNotifications).mockResolvedValueOnce(false);
    await renderAt("waiting-open");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByText("Turn on notifications")).toBeTruthy();

    await act(async () => {
      listeners.forEach(listener => listener("active"));
      await jest.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByText("Turn on notifications")).toBeTruthy();

    jest.mocked(notificationsGranted).mockResolvedValueOnce(true);
    await act(async () => {
      listeners.forEach(listener => listener("active"));
      await jest.advanceTimersByTimeAsync(100);
    });
    expect(screen.queryByText("Turn on notifications")).toBeNull();
  });
});
