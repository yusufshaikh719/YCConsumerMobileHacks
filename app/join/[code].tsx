import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../../src/components/Avatar";
import { Button } from "../../src/components/Button";
import { Paper } from "../../src/components/Paper";
import { Postmark } from "../../src/components/Postmark";
import { money } from "../../src/lib/money";
import { useAnte } from "../../src/state/AnteProvider";
import { Text } from "../../src/theme/Text";
import { colors, radius, space } from "../../src/theme/tokens";

export default function Join() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { data } = useAnte();
  const insets = useSafeAreaInsets();
  const valid = String(code ?? "").toUpperCase() === data.group.inviteCode;
  return (
    <Paper style={{ paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.lg, paddingHorizontal: space.lg }}>
      <StatusBar style="dark" />
      <View style={styles.center}>
        <View style={styles.card}>
          <View style={styles.stamp}><Postmark size={96} top="INVITE" middle={String(code ?? "").toUpperCase()} bottom="ANTE" /></View>
          <Text variant="label" color={colors.leaf}>{valid ? "You're invited" : "Invite not found"}</Text>
          <Text variant="display">{valid ? data.group.name : "Check the link"}</Text>
          {valid && (
            <>
              <View style={styles.faces}>
                {data.group.members.map((m, i) => <View key={m.id} style={{ marginLeft: i ? -8 : 0 }}><Avatar member={m} size={34} ring={colors.card} /></View>)}
              </View>
              <Text variant="body" color={colors.inkSoft}>
                {money(data.stakeCents)} into this week's {money(data.potCents)} pot. One surprise sidequest a day inside your free window. Most stamps by Sunday takes it.
              </Text>
            </>
          )}
        </View>
      </View>
      <Button label={valid ? "Join the group" : "Go home"} onPress={() => router.replace("/")} />
    </Paper>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center" },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cardEdge, padding: space.lg, paddingTop: space.xl, gap: space.sm },
  stamp: { position: "absolute", right: space.md, top: -36 },
  faces: { flexDirection: "row", marginVertical: space.xs },
});
