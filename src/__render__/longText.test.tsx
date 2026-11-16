import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import Passport from "../../app/passport";
import { LandmarkCard } from "../components/LandmarkCard";
import { PotStatus } from "../components/PotStatus";
import { createLocalService } from "../services/localService";
import { memoryStorage } from "../services/memoryStorage";
import { LANDMARK, renderApp } from "./harness";

const LONG_PLACE = "Palace of Fine Arts Rotunda and Lagoon at the Panama-Pacific Exposition Grounds";
const style = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;

describe("long strings stay inside their cards", () => {
  it("LANDMARK CARD caps a long name and neighborhood instead of overflowing", async () => {
    await render(<LandmarkCard landmark={{ ...LANDMARK, name: LONG_PLACE, neighborhood: "Marina District and Cow Hollow Waterfront" }} />);
    expect(screen.getByText(LONG_PLACE).props.numberOfLines).toBe(2);
    expect(screen.getByText("Marina District and Cow Hollow Waterfront").props.numberOfLines).toBe(1);
  });

  it("POT STATUS lets the Whop badge wrap onto its own line when the row is too narrow", async () => {
    const local = createLocalService({ storage: memoryStorage(null) });
    await local.load();
    const data = { ...local.getSnapshot(), backend: "convex" as const, potCents: 125_000, funding: { payments: "sandbox" as const, myStake: "unpaid" as const, paidCount: 4, lastPayout: null } };
    await render(<PotStatus data={data} />);
    expect(screen.getByText(/\$1250 in the pot/)).toBeTruthy();
    const badge = screen.getByText("Whop").parent;
    expect(style(badge!)).toMatchObject({ flexShrink: 1 });
    expect(style(badge!.parent!)).toMatchObject({ flexDirection: "row", flexWrap: "wrap" });
  });

  it("PASSPORT keeps a long holder name and group name clear of the stamp count", async () => {
    await renderApp(<Passport />, { name: "Maximiliana Montgomery-Fitzgerald III", group: { name: "The Extraordinarily Long Weekend Walkers", inviteCode: "HILL42", joined: false } });
    const name = screen.getByText("Maximiliana Montgomery-Fitzgerald III");
    expect(name.props.numberOfLines).toBe(2);
    expect(screen.getByText("The Extraordinarily Long Weekend Walkers").props.numberOfLines).toBe(2);
    expect(style(name.parent!)).toMatchObject({ flex: 1, minWidth: 0 });
  });
});
