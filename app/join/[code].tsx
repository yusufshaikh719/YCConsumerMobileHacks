import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../../src/components/Button";
import { Paper } from "../../src/components/Paper";
import { Postmark } from "../../src/components/Postmark";
import { shareInvite } from "../../src/lib/invite";
import { money } from "../../src/lib/money";
import { parseInviteCode } from "../../src/lib/windows";
import { useAnte } from "../../src/state/AnteProvider";
import { Text } from "../../src/theme/Text";
import { colors, radius, space } from "../../src/theme/tokens";

export default function Join() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { data } = useAnte();
  const insets = useSafeAreaInsets();
  const invite = parseInviteCode(String(code ?? ""));
  const own = invite === data.group.inviteCode;
  return (
    <Paper style={{ paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.lg, paddingHorizontal: space.lg }}>
      <StatusBar style="dark" />
      <View style={styles.center}>
        <View style={styles.card}>
          <View style={styles.stamp}><Postmark size={96} top="INVITE" middle={invite ?? "?"} bottom="ANTE" /></View>
          <Text variant="label" color={colors.leaf}>{own ? "Your invite" : invite ? "You're invited" : "Invite not found"}</Text>
          <Text variant="display">{own ? data.group.name : invite ? `Group ${invite}` : "Check the link"}</Text>
          <Text variant="body" color={colors.inkSoft}>
            {own
              ? `This is the link you send. Everyone who joins puts ${money(data.stakeCents)} into the weekly pot.`
              : invite
                ? `${money(data.stakeCents)} into the weekly pot, one surprise sidequest a day, most stamps by Sunday takes it.${data.backend === "convex" ? "" : " Offline mode: this phone can't join groups made on other phones."}`
                : "This link doesn't carry a valid invite code. Ask your friend to send it again."}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        {own && <Button label="Share invite" onPress={() => void shareInvite(data)} />}
        {!own && invite && <Button label="Join this group" onPress={() => router.replace({ pathname: "/onboarding", params: { code: invite } })} />}
        <Button label={own || !invite ? "Back home" : "Not now"} kind={own || invite ? "quiet" : "primary"} onPress={() => router.replace("/")} />
      </View>
    </Paper>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center" },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cardEdge, padding: space.lg, paddingTop: space.xl, gap: space.sm },
  stamp: { position: "absolute", right: space.md, top: -36 },
  actions: { gap: space.sm },
});
