import { useState } from "react";
import { Linking, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { money } from "../lib/money";
import { weekdayShort } from "../lib/time";
import { ante } from "../services";
import type { AnteSnapshot } from "../services/types";
import { Text } from "../theme/Text";
import { colors, radius, space } from "../theme/tokens";
import { Button } from "./Button";

const TRANSFER_COPY = {
  whop: "paid out by Whop transfer",
  pending: "Whop transfer still processing",
  fallback: "recorded in Ante only, no Whop transfer went out",
} as const;

export function PotStatus({ data, style }: { data: AnteSnapshot; style?: StyleProp<ViewStyle> }) {
  const [opening, setOpening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { funding } = data;
  const live = funding.payments !== "unavailable";

  const buyIn = async () => {
    setOpening(true);
    setNotice(null);
    try {
      const checkout = await ante.buyIn();
      if (checkout.url) {
        await Linking.openURL(checkout.url);
        setNotice("Finish the payment in Whop. The pot updates here as soon as Whop confirms it.");
      } else {
        setNotice("Whop checkout isn't available right now, so nothing was charged and the pot is unchanged.");
      }
    } catch {
      setNotice("Couldn't reach the server to start checkout. Nothing was charged.");
    } finally {
      setOpening(false);
    }
  };

  if (data.backend === "local") {
    return (
      <View style={[styles.card, style]}>
        <Text variant="label" color={colors.warn}>Offline mode</Text>
        <Text variant="small" color={colors.inkSoft}>This build isn't connected to the group server, so your group and pot live only on this phone and no money moves.</Text>
      </View>
    );
  }

  const payout = funding.lastPayout;
  return (
    <View style={[styles.card, style]}>
      <View style={styles.row}>
        <Text variant="label" color={colors.muted}>Weekly buy-in</Text>
        <View style={[styles.badge, !live && styles.badgeOff]}>
          <Text variant="label" color={live ? colors.moss : colors.warn}>{live ? "Whop" : "Payments off"}</Text>
        </View>
      </View>
      <Text variant="bodyStrong">
        {money(data.potCents)} in the pot · {funding.paidCount} of {data.group.members.length} bought in
      </Text>
      {funding.payments === "unavailable" ? (
        <Text variant="small" color={colors.inkSoft}>Whop isn't configured on the server, so buy-ins are off and the pot stays at what Whop has actually confirmed.</Text>
      ) : funding.myStake === "paid" ? (
        <Text variant="small" color={colors.leaf}>You're in for {money(data.stakeCents)} this week.</Text>
      ) : (
        <>
          <Text variant="small" color={colors.inkSoft}>Put {money(data.stakeCents)} in through Whop. Most stamps by {weekdayShort(data.weekEndsAt)} 9 PM takes the pot.</Text>
          <Button label={opening ? "Opening Whop…" : `Buy in ${money(data.stakeCents)}`} onPress={() => void (opening ? undefined : buyIn())} />
        </>
      )}
      {notice && <Text variant="small" color={colors.inkSoft}>{notice}</Text>}
      {payout && (
        <Text variant="small" color={colors.muted}>
          Last week: {payout.winners.join(" & ")} won {money(payout.amountCents)}, {TRANSFER_COPY[payout.transfer]}.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: space.lg, marginTop: space.lg, padding: space.md, gap: space.xs, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardEdge },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.xs },
  badge: { paddingHorizontal: space.xs, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.leafSoft },
  badgeOff: { backgroundColor: colors.paper },
});
