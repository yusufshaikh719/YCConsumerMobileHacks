import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Paper } from "../components/Paper";
import { haptic } from "../lib/haptics";
import { useNow } from "../lib/useNow";
import type { Sidequest } from "../services/types";
import { pingSecondsLeft, type Timing } from "../state/machine";
import { useReducedMotion } from "../theme/motion";
import { Text } from "../theme/Text";
import { colors, space } from "../theme/tokens";

const BUZZ_AT = new Set([10, 3, 2, 1]);

export function Ping({ timing, quest }: { timing: Timing; quest: Sidequest | null }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const now = useNow(200);
  const seconds = pingSecondsLeft(timing, now);
  const searching = seconds === 0 && !quest;
  const slam = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const beat = useRef(new Animated.Value(1)).current;
  const last = useRef<number | null>(null);

  useEffect(() => {
    haptic.slam();
    Animated.spring(slam, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }).start();
  }, [slam]);

  useEffect(() => {
    if (last.current === seconds) return;
    const first = last.current === null;
    last.current = seconds;
    if (!first && BUZZ_AT.has(seconds)) haptic.slam();
    if (reduced || first) return;
    beat.setValue(seconds <= 10 ? 1.08 : 1.03);
    Animated.timing(beat, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [seconds, reduced, beat]);

  const urgent = seconds <= 10;
  return (
    <Paper tone="moss" style={{ paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl }}>
      <StatusBar style="light" />
      <Animated.View
        style={[
          styles.fill,
          { opacity: slam, transform: [{ scale: slam.interpolate({ inputRange: [0, 1], outputRange: [1.35, 1] }) }] },
        ]}
      >
        <View style={styles.top}>
          <View style={styles.dot} />
          <Text variant="label" color={colors.sprout}>Sidequest incoming</Text>
        </View>
        <View style={styles.center} accessibilityLiveRegion="polite" accessibilityLabel={`${seconds} seconds`}>
          {searching ? (
            <Text variant="hero" color={colors.sprout} align="center" maxFontSizeMultiplier={1.15}>Finding your landmark…</Text>
          ) : (
            <Animated.View style={{ transform: [{ scale: beat }] }}>
              <Text variant="scoreboard" color={urgent ? colors.sprout : colors.onMoss} style={styles.count} allowFontScaling={false}>
                {seconds}
              </Text>
            </Animated.View>
          )}
          <Text variant="display" color={colors.onMoss} style={styles.shoes} maxFontSizeMultiplier={1.15}>Shoes on.</Text>
        </View>
        <Text variant="body" color={colors.onMossMuted} align="center">{searching ? "Looking for something worth a 10-minute walk." : "Your landmark drops at zero."}</Text>
      </Animated.View>
    </Paper>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, paddingHorizontal: space.lg },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xs },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.sprout },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  count: { fontSize: 260, lineHeight: 250, includeFontPadding: false },
  shoes: { fontSize: 56, lineHeight: 58, marginTop: space.sm },
});
