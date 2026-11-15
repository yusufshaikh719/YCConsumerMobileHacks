import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect } from "react-native-svg";
import { Button } from "../components/Button";
import { Paper } from "../components/Paper";
import { Postmark } from "../components/Postmark";
import { ordinal } from "../lib/money";
import { formatClock } from "../lib/time";
import { useNow } from "../lib/useNow";
import type { Sidequest } from "../services/types";
import { useAnte } from "../state/AnteProvider";
import { Text } from "../theme/Text";
import { colors, space } from "../theme/tokens";

export function Failed({ quest, reason }: { quest: Sidequest; reason: "timeout" | "not_verified" }) {
  const { data, dispatch } = useAnte();
  const insets = useSafeAreaInsets();
  const now = useNow(1000);
  const me = data.standings.find(s => s.member.id === data.meId);
  const canRetake = reason === "not_verified" && now < quest.expiresAt;
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
            <Postmark size={120} top={quest.landmark.name.toUpperCase()} middle={reason === "timeout" ? "NEXT TIME" : "RETAKE"} bottom="ANTE" color={colors.muted} rotate={-8} />
          </View>
        </View>
        <Text variant="label" color={colors.muted} style={styles.label}>{reason === "timeout" ? "Time's up" : "No stamp yet"}</Text>
        <Text variant="display" align="center">{reason === "timeout" ? "This one got away." : "We couldn't see the landmark."}</Text>
        <Text variant="body" color={colors.inkSoft} align="center" style={styles.body}>
          {reason === "timeout"
            ? `No harm done. ${quest.landmark.name} isn't going anywhere, and your next window opens at ${formatClock(data.window.startMinute)}.`
            : `Step back so ${quest.landmark.name} fills more of the frame behind you, then try again.`}
        </Text>
        {me && <Text variant="small" color={colors.muted} align="center">Still {ordinal(me.rank)} this week with {me.completed} stamps.</Text>}
      </View>
      <View style={styles.actions}>
        {canRetake && <Button label="Take another selfie" onPress={() => dispatch({ type: "RETAKE", now: Date.now() })} />}
        <Button label="Back to waiting" kind={canRetake ? "quiet" : "primary"} onPress={() => dispatch({ type: "DONE" })} />
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
