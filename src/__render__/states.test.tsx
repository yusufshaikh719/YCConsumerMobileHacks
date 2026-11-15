import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { useEffect } from "react";
import Home from "../../app/index";
import { useAnte, type DevTarget } from "../state/AnteProvider";
import { renderApp } from "./harness";

let jump: (target: DevTarget) => Promise<void>;

function Probe() {
  const ante = useAnte();
  useEffect(() => {
    jump = ante.jump;
  });
  return null;
}

async function renderAt(target?: DevTarget) {
  await renderApp(
    <>
      <Probe />
      <Home />
    </>,
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
});

describe("home renders the current state", () => {
  it("WAITING inside the window is armed and never shows the ping time", async () => {
    await renderAt("waiting-open");
    expect(screen.getByText("Could be any minute.")).toBeTruthy();
    expect(screen.getByText("$120")).toBeTruthy();
    expect(screen.getByText("2nd")).toBeTruthy();
    expect(screen.getByText("Painted Ladies")).toBeTruthy();
    expect(screen.queryByText(/\d:\d\d (AM|PM)/)).toBeNull();
  });

  it("WAITING outside the window says when it opens", async () => {
    await renderAt("waiting-closed");
    expect(screen.getByText("Opens 3:00 PM")).toBeTruthy();
  });

  it("PING shows the countdown and hides the destination", async () => {
    await renderAt("ping");
    expect(screen.getByText("Shoes on.")).toBeTruthy();
    expect(screen.getByLabelText(/^\d+ seconds$/)).toBeTruthy();
    expect(screen.queryByText("Coit Tower")).toBeNull();
  });

  it("PING turns into QUEST LIVE at zero", async () => {
    await renderAt("ping");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(61_000);
    });
    expect(screen.getByText("Coit Tower")).toBeTruthy();
  });

  it("QUEST LIVE shows distance, landmark card, a Map toggle, and no camera button", async () => {
    await renderAt("live");
    expect(screen.getByText("Coit Tower")).toBeTruthy();
    expect(screen.getByLabelText(/meters to go$/)).toBeTruthy();
    expect(screen.getByText(/1929 bequest/)).toBeTruthy();
    expect(screen.queryByLabelText("Take selfie")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Show map"));
    expect(screen.getByLabelText("Show compass")).toBeTruthy();
  });

  it("ARRIVED becomes the selfie camera with the landmark hint", async () => {
    await renderAt("arrived");
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText("Get Coit Tower behind you.")).toBeTruthy();
    expect(screen.getByLabelText("Take selfie")).toBeTruthy();
  });

  it("VERIFYING resolves into VERIFIED with leaderboard movement", async () => {
    await renderAt("verifying");
    expect(screen.getByText("Checking you're at the spot")).toBeTruthy();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByText("You passed Sarah")).toBeTruthy();
    expect(screen.getByText("Back to waiting")).toBeTruthy();
  });

  it("TIME'S UP is gentle and goes back to waiting", async () => {
    await renderAt("failed");
    expect(screen.getByText("This one got away.")).toBeTruthy();
    expect(screen.queryByText("Take another selfie")).toBeNull();
    await fireEvent.press(screen.getByText("Back to waiting"));
    expect(screen.getByText("Sidequest Society")).toBeTruthy();
  });

  it("NOT VERIFIED offers a retake while time remains", async () => {
    await renderAt("not-verified");
    await fireEvent.press(screen.getByText("Take another selfie"));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByLabelText("Take selfie")).toBeTruthy();
  });
});
