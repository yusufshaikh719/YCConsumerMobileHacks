import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Line, Rect } from "react-native-svg";
import { Button } from "../src/components/Button";
import { Paper } from "../src/components/Paper";
import { ScreenHeader } from "../src/components/ScreenHeader";
import { haptic } from "../src/lib/haptics";
import { formatClock } from "../src/lib/time";
import { ante } from "../src/services";
import type { FreeWindow } from "../src/services/types";
import { useAnte } from "../src/state/AnteProvider";
import { Text } from "../src/theme/Text";
import { colors, radius, space, touch } from "../src/theme/tokens";

const STEP = 30;
const DAY_START = 6 * 60;
const DAY_END = 24 * 60;
const MIN_SPAN = 60;
const PRESETS: { label: string; window: FreeWindow }[] = [
  { label: "Lunch", window: { startMinute: 12 * 60, endMinute: 14 * 60 } },
  { label: "After class", window: { startMinute: 15 * 60, endMinute: 18 * 60 } },
  { label: "After work", window: { startMinute: 17 * 60 + 30, endMinute: 20 * 60 } },
  { label: "Evening", window: { startMinute: 19 * 60, endMinute: 22 * 60 } },
];

function Stepper({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
  const bump = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next !== value) {
      haptic.select();
      onChange(next);
    }
  };
  return (
    <View style={styles.stepper}>
      <Text variant="label" color={colors.muted}>{label}</Text>
      <Text variant="hero" style={styles.time} adjustsFontSizeToFit numberOfLines={1}>{formatClock(value)}</Text>
      <View style={styles.stepRow}>
        {[-STEP, STEP].map(delta => (
          <Pressable
            key={delta}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${delta < 0 ? "earlier" : "later"}`}
            disabled={delta < 0 ? value <= min : value >= max}
            onPress={() => bump(delta)}
            style={({ pressed }) => [styles.step, pressed && styles.stepPressed, (delta < 0 ? value <= min : value >= max) && styles.stepDisabled]}
          >
            <Text variant="title" color={colors.ink}>{delta < 0 ? "−" : "+"}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function DayBar({ window }: { window: FreeWindow }) {
  const width = 300;
  const x = (m: number) => ((m - DAY_START) / (DAY_END - DAY_START)) * width;
  return (
    <View style={styles.bar}>
      <Svg width="100%" height={44} viewBox={`0 0 ${width} 44`} preserveAspectRatio="none">
        <Rect x={0} y={14} width={width} height={14} rx={7} fill={colors.paper} />
        <Rect x={x(window.startMinute)} y={14} width={x(window.endMinute) - x(window.startMinute)} height={14} rx={7} fill={colors.leaf} />
        {[6, 9, 12, 15, 18, 21, 24].map(h => <Line key={h} x1={x(h * 60)} x2={x(h * 60)} y1={32} y2={38} stroke={colors.muted} strokeWidth={1} />)}
      </Svg>
      <View style={styles.ticks}>
        {["6a", "9a", "12p", "3p", "6p", "9p", "12a"].map(t => <Text key={t} variant="small" color={colors.muted} style={styles.tick}>{t}</Text>)}
      </View>
    </View>
  );
}

export default function Settings() {
  const { data } = useAnte();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<FreeWindow>(data.window);
  const changed = draft.startMinute !== data.window.startMinute || draft.endMinute !== data.window.endMinute;
  const hours = (draft.endMinute - draft.startMinute) / 60;

  return (
    <Paper style={{ paddingTop: insets.top }}>
      <StatusBar style="dark" />
      <ScreenHeader title="Free window" subtitle="When Ante is allowed to ping you" />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + space.xl, gap: space.lg }}>
        <View style={styles.card}>
          <View style={styles.pair}>
            <Stepper label="From" value={draft.startMinute} min={DAY_START} max={draft.endMinute - MIN_SPAN} onChange={startMinute => setDraft(d => ({ ...d, startMinute }))} />
            <View style={styles.divider} />
            <Stepper label="Until" value={draft.endMinute} min={draft.startMinute + MIN_SPAN} max={DAY_END - STEP} onChange={endMinute => setDraft(d => ({ ...d, endMinute }))} />
          </View>
          <DayBar window={draft} />
          <Text variant="small" color={colors.inkSoft} align="center">
            {hours} {hours === 1 ? "hour" : "hours"} a day. Ante picks one random minute inside it, and nobody knows when. Not even you.
          </Text>
        </View>

        <View>
          <Text variant="label" color={colors.muted} style={styles.presetsLabel}>Quick picks</Text>
          <View style={styles.presets}>
            {PRESETS.map(p => {
              const active = p.window.startMinute === draft.startMinute && p.window.endMinute === draft.endMinute;
              return (
                <Pressable key={p.label} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => { haptic.select(); setDraft(p.window); }} style={[styles.preset, active && styles.presetActive]}>
                  <Text variant="bodyStrong" color={active ? colors.leaf : colors.ink}>{p.label}</Text>
                  <Text variant="small" color={colors.muted}>{formatClock(p.window.startMinute)} – {formatClock(p.window.endMinute)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Button
          label={changed ? "Save window" : "Done"}
          onPress={() => {
            if (changed) {
              haptic.success();
              void ante.setWindow(draft);
            }
            router.back();
          }}
        />
      </ScrollView>
    </Paper>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cardEdge, padding: space.lg, gap: space.md },
  pair: { flexDirection: "row", alignItems: "stretch" },
  divider: { width: 1, backgroundColor: colors.cardEdge, marginHorizontal: space.sm },
  stepper: { flex: 1, alignItems: "center", gap: space.xxs },
  time: { fontSize: 46, lineHeight: 50 },
  stepRow: { flexDirection: "row", gap: space.xs, marginTop: space.xs },
  step: { width: touch.min, height: touch.min, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.rule },
  stepPressed: { backgroundColor: colors.leafSoft },
  stepDisabled: { opacity: 0.35 },
  bar: { gap: 0 },
  ticks: { flexDirection: "row", justifyContent: "space-between", marginTop: -4 },
  tick: { fontSize: 11 },
  presetsLabel: { marginBottom: space.sm },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  preset: { width: "48.8%", minHeight: 64, padding: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardEdge, backgroundColor: colors.card, justifyContent: "center" },
  presetActive: { borderColor: colors.leaf, backgroundColor: colors.leafSoft },
});
