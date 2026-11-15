import { StatusBar } from "expo-status-bar";
import { Linking, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect } from "react-native-svg";
import { Button } from "../components/Button";
import { Paper } from "../components/Paper";
import { Postmark } from "../components/Postmark";
import { ordinal } from "../lib/money";
import { formatTimeOfDay, nextWindowStart } from "../lib/time";
import { useNow } from "../lib/useNow";
import type { Sidequest } from "../services/types";
import type { FailReason } from "../state/machine";
import { useAnte } from "../state/AnteProvider";
import { Text } from "../theme/Text";
import { colors, space } from "../theme/tokens";

export function Failed({ quest, reason }: { quest: Sidequest | null; reason: FailReason }) {
  const { data, dispatch } = useAnte();
  const insets = useSafeAreaInsets();
  const now = useNow(1000);
  const me = data.standings.find(s => s.member.id === data.meId);
  const canRetake = reason === "not_verified" && !!quest && now < quest.expiresAt;
  const place = quest?.landmark.name ?? "Your landmark";
  const next = nextWindowStart(data.windows, now);
  const opens = formatTimeOfDay(next ?? now);
  const copy: Record<FailReason, { label: string; title: string; body: string; mark: string }> = {
    timeout: { label: "Time's up", title: "This one got away.", body: `No harm done. ${place} isn't going anywhere, and your next window opens at ${opens}.`, mark: "NEXT TIME" },
    not_verified: { label: "No stamp yet", title: "We couldn't confirm you're there.", body: `Get closer to ${place} and keep it behind you, then try again.`, mark: "RETAKE" },
    no_location: { label: "Location is off", title: "We need to know where you are.", body: "Ante uses your location only during a sidequest, to pick a landmark a short walk away and see you arrive. Turn it on and you'll be ready for the next one.", mark: "NO SIGNAL" },
    no_landmark: { label: "Nothing nearby", title: "No landmark within a short walk.", body: `We searched Wikipedia and OpenStreetMap around you and came up empty. Today's sidequest is skipped, no penalty. Next window opens at ${opens}.`, mark: "SKIPPED" },
  };
  const c = copy[reason];
  const w = 220;
  const h = 260;
  return (
    <Paper style={{ paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.lg }}>
      <StatusBar style="dark" />
      <View style={styles.center}>
        <View style={{ width: w, height: h }}>
          <Svg width={w} height={h}>
            <Rect x={2} y={2} width={w - 4} height={h - 4} rx={8} stroke={colors.rule} strokeWidth={2} strokeDasharray="6 8" fill={colors.card} fillOpacity={0.5} />
          </Svg>
          <View style={styles.mark}>
            <Postmark size={120} top={place.toUpperCase()} middle={c.mark} bottom="ANTE" color={colors.muted} rotate={-8} fill="transparent" />
          </View>
        </View>
        <Text variant="label" color={colors.muted} style={styles.label}>{c.label}</Text>
        <Text variant="display" align="center">{c.title}</Text>
        <Text variant="body" color={colors.inkSoft} align="center" style={styles.body}>{c.body}</Text>
        {me && data.standings.length > 1 && <Text variant="small" color={colors.muted} align="center">Still {ordinal(me.rank)} this week with {me.completed} stamps.</Text>}
      </View>
      <View style={styles.actions}>
        {canRetake && <Button label="Take another selfie" onPress={() => dispatch({ type: "RETAKE", now: Date.now() })} />}
        {reason === "no_location" && <Button label="Open Settings" onPress={() => void Linking.openSettings()} />}
        <Button label="Back to waiting" kind={canRetake || reason === "no_location" ? "quiet" : "primary"} onPress={() => dispatch({ type: "DONE" })} />
      </View>
    </Paper>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg, gap: space.xs },
  mark: { position: "absolute", top: 70, left: 50 },
  label: { marginTop: space.lg },
  body: { maxWidth: 320 },
  actions: { paddingHorizontal: space.lg, gap: space.sm },
});
