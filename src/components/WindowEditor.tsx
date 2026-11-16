import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";
import { haptic } from "../lib/haptics";
import { formatClock } from "../lib/time";
import { addWindow, boundsFor, DAY_START, fits, MAX_WINDOWS, sortWindows, STEP } from "../lib/windows";
import type { FreeWindow } from "../services/types";
import { Text } from "../theme/Text";
import { colors, radius, space, touch } from "../theme/tokens";
import { Button } from "./Button";

const DAY_END = 24 * 60;
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
        {[-STEP, STEP].map(delta => {
          const disabled = delta < 0 ? value <= min : value >= max;
          return (
            <Pressable
              key={delta}
              accessibilityRole="button"
              accessibilityLabel={`${label} ${delta < 0 ? "earlier" : "later"}`}
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => bump(delta)}
              style={({ pressed }) => [styles.step, pressed && styles.stepPressed, disabled && styles.stepDisabled]}
            >
              <Text variant="title" color={colors.ink}>{delta < 0 ? "−" : "+"}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DayBar({ windows, selected }: { windows: FreeWindow[]; selected: number }) {
  const width = 300;
  const x = (m: number) => ((m - DAY_START) / (DAY_END - DAY_START)) * width;
  return (
    <View>
      <Svg width="100%" height={44} viewBox={`0 0 ${width} 44`} preserveAspectRatio="none">
        <Rect x={0} y={14} width={width} height={14} rx={7} fill={colors.paper} />
        {windows.map((w, i) => (
          <Rect key={i} x={x(w.startMinute)} y={14} width={x(w.endMinute) - x(w.startMinute)} height={14} rx={7} fill={i === selected ? colors.leaf : colors.moss} fillOpacity={i === selected ? 1 : 0.45} />
        ))}
        {[6, 9, 12, 15, 18, 21, 24].map(h => <Line key={h} x1={x(h * 60)} x2={x(h * 60)} y1={32} y2={38} stroke={colors.muted} strokeWidth={1} />)}
      </Svg>
      <View style={styles.ticks}>
        {["6a", "9a", "12p", "3p", "6p", "9p", "12a"].map(t => <Text key={t} variant="small" color={colors.muted} style={styles.tick}>{t}</Text>)}
      </View>
    </View>
  );
}

export function WindowEditor({ windows, onChange }: { windows: FreeWindow[]; onChange: (windows: FreeWindow[]) => void }) {
  const sorted = sortWindows(windows);
  const [picked, setPicked] = useState(0);
  const selected = Math.min(picked, sorted.length - 1);
  const current = sorted[selected];
  const bounds = boundsFor(sorted, selected);
  const hours = sorted.reduce((sum, w) => sum + w.endMinute - w.startMinute, 0) / 60;
  const added = addWindow(sorted);

  const update = (next: FreeWindow) => {
    const list = sortWindows(sorted.map((w, i) => (i === selected ? next : w)));
    onChange(list);
    setPicked(list.indexOf(next));
  };
  const remove = (index: number) => {
    haptic.select();
    onChange(sorted.filter((_, i) => i !== index));
    setPicked(Math.max(0, Math.min(selected, sorted.length - 2)));
  };
  const add = () => {
    if (!added) return;
    haptic.select();
    const fresh = added.findIndex(w => !sorted.some(s => s.startMinute === w.startMinute && s.endMinute === w.endMinute));
    onChange(added);
    setPicked(fresh);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.list}>
        {sorted.map((w, i) => {
          const range = `${formatClock(w.startMinute)} – ${formatClock(w.endMinute)}`;
          const active = i === selected;
          return (
            <View key={`${w.startMinute}-${i}`} style={[styles.slot, active && styles.slotActive]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Edit window ${range}`} accessibilityState={{ selected: active }} onPress={() => setPicked(i)} style={styles.slotMain}>
                <Text variant="label" color={active ? colors.leaf : colors.muted}>Window {i + 1}</Text>
                <Text variant="bodyStrong">{range}</Text>
              </Pressable>
              {sorted.length > 1 && (
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove window ${range}`} onPress={() => remove(i)} hitSlop={8} style={styles.remove}>
                  <Text variant="title" color={colors.muted}>×</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.card}>
        <View style={styles.pair}>
          <Stepper label="From" value={current.startMinute} min={bounds.startMin} max={bounds.startMax} onChange={startMinute => update({ ...current, startMinute })} />
          <View style={styles.divider} />
          <Stepper label="Until" value={current.endMinute} min={bounds.endMin} max={bounds.endMax} onChange={endMinute => update({ ...current, endMinute })} />
        </View>
        <DayBar windows={sorted} selected={selected} />
        <Text variant="small" color={colors.inkSoft} align="center">
          {hours} {hours === 1 ? "hour" : "hours"} a day{sorted.length > 1 ? ` across ${sorted.length} windows` : ""}. Ante picks one random minute inside them, and nobody knows when. Not even you.
        </Text>
      </View>

      <View>
        <Text variant="label" color={colors.muted} style={styles.presetsLabel}>Quick picks for window {selected + 1}</Text>
        <View style={styles.presets}>
          {PRESETS.map(p => {
            const active = p.window.startMinute === current.startMinute && p.window.endMinute === current.endMinute;
            const disabled = !active && !fits(sorted, selected, p.window);
            return (
              <Pressable
                key={p.label}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled }}
                disabled={disabled}
                onPress={() => {
                  haptic.select();
                  update(p.window);
                }}
                style={[styles.preset, active && styles.presetActive, disabled && styles.stepDisabled]}
              >
                <Text variant="bodyStrong" color={active ? colors.leaf : colors.ink}>{p.label}</Text>
                <Text variant="small" color={colors.muted}>{formatClock(p.window.startMinute)} – {formatClock(p.window.endMinute)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {added ? <Button kind="quiet" label="Add another window" onPress={add} /> : <Text variant="small" color={colors.muted} align="center">{sorted.length >= MAX_WINDOWS ? `Up to ${MAX_WINDOWS} windows a day.` : "No room left for another hour-long window."}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  list: { gap: space.xs },
  slot: { flexDirection: "row", alignItems: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardEdge, backgroundColor: colors.card },
  slotActive: { borderColor: colors.leaf, backgroundColor: colors.leafSoft },
  slotMain: { flex: 1, minHeight: 56, justifyContent: "center", paddingHorizontal: space.md, gap: 2 },
  remove: { width: touch.min, height: touch.min, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cardEdge, padding: space.lg, gap: space.md },
  pair: { flexDirection: "row", alignItems: "stretch" },
  divider: { width: 1, backgroundColor: colors.cardEdge, marginHorizontal: space.sm },
  stepper: { flex: 1, alignItems: "center", gap: space.xxs },
  time: { fontSize: 46, lineHeight: 50 },
  stepRow: { flexDirection: "row", gap: space.xs, marginTop: space.xs },
  step: { width: touch.min, height: touch.min, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.rule },
  stepPressed: { backgroundColor: colors.leafSoft },
  stepDisabled: { opacity: 0.35 },
  ticks: { flexDirection: "row", justifyContent: "space-between", marginTop: -4 },
  tick: { fontSize: 11 },
  presetsLabel: { marginBottom: space.sm },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  preset: { width: "48.8%", minHeight: 64, padding: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardEdge, backgroundColor: colors.card, justifyContent: "center" },
  presetActive: { borderColor: colors.leaf, backgroundColor: colors.leafSoft },
});
