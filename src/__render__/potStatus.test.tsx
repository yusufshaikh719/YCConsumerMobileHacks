import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { PotStatus } from "../components/PotStatus";
import { createLocalService } from "../services/localService";
import { memoryStorage } from "../services/memoryStorage";
import type { AnteService, AnteSnapshot, BuyIn, Funding } from "../services/types";

const holder = () => jest.requireMock<{ __holder: { current: Partial<AnteService> } }>("../services").__holder;

async function snapshot(funding: Partial<Funding>, backend: AnteSnapshot["backend"] = "convex"): Promise<AnteSnapshot> {
  const local = createLocalService({ storage: memoryStorage(null) });
  await local.load();
  const base = local.getSnapshot();
  return { ...base, backend, potCents: 2000, funding: { payments: "sandbox", myStake: "unpaid", paidCount: 1, lastPayout: null, ...funding } };
}

describe("pot status", () => {
  it("labels the Whop sandbox and opens the sandbox checkout on buy-in", async () => {
    const buyIn = jest.fn(async (): Promise<BuyIn> => ({ url: "https://sandbox.whop.com/checkout/ch_1/", mode: "live" }));
    holder().current = { buyIn };
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await render(<PotStatus data={await snapshot({})} />);
    expect(screen.getByText("Whop sandbox · test money")).toBeTruthy();
    await fireEvent.press(screen.getByText("Buy in $20 (sandbox)"));
    expect(buyIn).toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith("https://sandbox.whop.com/checkout/ch_1/");
    expect(screen.getByText(/Finish the test payment in Whop sandbox/)).toBeTruthy();
  });

  it("says honestly when checkout falls back and nothing was charged", async () => {
    holder().current = { buyIn: async () => ({ url: null, mode: "fallback" }) };
    await render(<PotStatus data={await snapshot({})} />);
    await fireEvent.press(screen.getByText("Buy in $20 (sandbox)"));
    expect(screen.getByText(/nothing was charged/)).toBeTruthy();
  });

  it("shows a paid stake and last week's payout, marking a fallback transfer", async () => {
    await render(<PotStatus data={await snapshot({ myStake: "paid", lastPayout: { winners: ["Yusuf"], amountCents: 4000, transfer: "fallback", at: 0 } })} />);
    expect(screen.getByText("You're in for $20 this week.")).toBeTruthy();
    expect(screen.getByText(/Yusuf won \$40, recorded in Ante only/)).toBeTruthy();
    expect(screen.queryByText(/Buy in/)).toBeNull();
  });

  it("labels offline mode instead of a fake pot", async () => {
    await render(<PotStatus data={await snapshot({}, "local")} />);
    expect(screen.getByText("Offline mode")).toBeTruthy();
    expect(screen.queryByText(/Buy in/)).toBeNull();
  });
});
