import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "../lib/haptics";
import { useAnte, type DevTarget } from "../state/AnteProvider";
import { Text } from "../theme/Text";
import { colors, radius, space, touch } from "../theme/tokens";
import { devToolsEnabled } from "./enabled";


const TARGETS: { target: DevTarget; label: string; hint: string }[] = [
  { target: "waiting-open", label: "Waiting", hint: "Window open, armed" },
  { target: "waiting-closed", label: "Waiting", hint: "Outside window" },
  { target: "ping", label: "Ping", hint: "60s countdown" },
  { target: "ping-notification", label: "Real ping", hint: "Notification in 10s" },
  { target: "live", label: "Quest live", hint: "Compass + timer" },
  { target: "arrived", label: "Arrived", hint: "Selfie at YC HQ entrance" },
  { target: "verifying", label: "Verifying", hint: "Stamp pending" },
  { target: "verified", label: "Verified", hint: "Postcard + stamp" },
  { target: "failed", label: "Time's up", hint: "Window closed" },
  { target: "not-verified", label: "Not verified", hint: "Retake allowed" },
];

export function DevSwitcher() {
  const { jump, phase } = useAnte();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  if (!devToolsEnabled) return null;
  return (
    <>
      <Pressable accessibilityLabel="Open demo state switcher" onPress={() => setOpen(true)} style={[styles.tab, { top: insets.top + 120 }]} hitSlop={12}>
        <Text variant="label" color={colors.paper} style={styles.tabText}>DEV</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
          <Text variant="label" color={colors.muted}>Demo states · now {phase.name}</Text>
          <View style={styles.grid}>
            {TARGETS.map(item => (
              <Pressable
                key={item.target}
                onPress={() => {
                  haptic.select();
                  setOpen(false);
                  void jump(item.target);
                }}
                style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
              >
                <Text variant="bodyStrong">{item.label}</Text>
                <Text variant="small" color={colors.muted}>{item.hint}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  tab: { position: "absolute", right: 0, paddingVertical: 10, paddingHorizontal: 6, backgroundColor: colors.ink, borderTopLeftRadius: radius.sm, borderBottomLeftRadius: radius.sm, opacity: 0.55, zIndex: 50 },
  tabText: { fontSize: 10, letterSpacing: 1.6 },
  scrim: { flex: 1, backgroundColor: "rgba(15,46,30,0.35)" },
  sheet: { backgroundColor: colors.paper, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, gap: space.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  cell: { width: "48.8%", minHeight: touch.large, justifyContent: "center", padding: space.sm, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge },
  pressed: { backgroundColor: colors.leafSoft },
});
