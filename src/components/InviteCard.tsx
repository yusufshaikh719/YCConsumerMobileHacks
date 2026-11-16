import { StyleSheet, View } from "react-native";
import { shareInvite } from "../lib/invite";
import { money } from "../lib/money";
import type { AnteSnapshot } from "../services/types";
import { Text } from "../theme/Text";
import { colors, radius, space } from "../theme/tokens";
import { Button } from "./Button";
import { Perforation } from "./Perforation";
import { Postmark } from "./Postmark";

type Props = { data: AnteSnapshot; title: string; body: string };

export function InviteCard({ data, title, body }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.lines}>
          <Text variant="label" color={colors.leaf}>Wish you were here</Text>
          <Text variant="title">{title}</Text>
        </View>
        <Postmark size={76} top="INVITE" middle={money(data.stakeCents)} bottom="ANTE" rotate={10} fill="transparent" />
      </View>
      <View style={styles.address}>
        <View style={styles.rule} />
        <View style={styles.rule} />
      </View>
      <Text variant="body" color={colors.inkSoft}>{body}</Text>
      <Button label="Invite friends" onPress={() => void shareInvite(data)} />
      <Perforation color={colors.paper} edge="top" count={22} />
      <Perforation color={colors.paper} edge="bottom" count={22} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: space.lg, padding: space.lg, gap: space.sm, backgroundColor: colors.card, borderRadius: radius.sm, shadowColor: "#3B3424", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  lines: { flex: 1, gap: 2 },
  address: { gap: 10, marginVertical: space.xxs },
  rule: { height: 1, backgroundColor: colors.cardEdge },
});
