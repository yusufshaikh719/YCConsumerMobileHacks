import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CompassArrow } from "../components/CompassArrow";
import { LandmarkCard } from "../components/LandmarkCard";
import { Paper } from "../components/Paper";
import { QuestMap } from "../components/QuestMap";
import { TimerRing } from "../components/TimerRing";
import { bearingDegrees, distanceMeters, formatDistance } from "../lib/geo";
import { haptic } from "../lib/haptics";
import { formatMinSec } from "../lib/time";
import { useNow } from "../lib/useNow";
import type { Sidequest } from "../services/types";
import { questProgress } from "../state/machine";
import { useAnte } from "../state/AnteProvider";
import { useReducedMotion } from "../theme/motion";
import { Text } from "../theme/Text";
import { colors, radius, space, touch } from "../theme/tokens";

export function QuestLive({ quest }: { quest: Sidequest }) {
  const { position, heading, locationDenied } = useAnte();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const now = useNow(1000);
  const reduced = useReducedMotion();
  const [showMap, setShowMap] = useState(false);
  const entry = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    haptic.slam();
    Animated.spring(entry, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }).start();
  }, [entry]);

  const here = position ?? quest.origin;
  const remaining = distanceMeters(here, quest.landmark.coords);
  const distance = formatDistance(remaining);
  const bearing = bearingDegrees(here, quest.landmark.coords);
  const ring = Math.min(width - space.xl * 2, height * 0.42, 340);
  const msLeft = quest.expiresAt - now;

  return (
    <Paper tone="moss" style={{ paddingTop: insets.top + space.xs, paddingBottom: insets.bottom + space.md }}>
      <StatusBar style="light" />
      <View style={styles.top}>
        <View style={styles.live}>
          <View style={styles.dot} />
          <Text variant="label" color={colors.sprout}>Sidequest live</Text>
        </View>
        <View style={styles.clock} accessibilityLabel={`${formatMinSec(msLeft)} left`}>
          <Text variant="title" color={colors.onMoss}>{formatMinSec(msLeft)}</Text>
          <Text variant="label" color={colors.onMossMuted}>left</Text>
        </View>
      </View>

      <Animated.View style={[styles.hero, { opacity: entry, transform: [{ scale: entry.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }] }]}>
        {showMap ? (
          <View style={[styles.mapWrap, { height: ring + 96 }]}>
            <QuestMap you={here} target={quest.landmark.coords} />
          </View>
        ) : (
          <>
            <TimerRing size={ring} progress={questProgress(quest, now)}>
              <CompassArrow size={ring * 0.46} rotation={bearing - (heading ?? 0)} />
            </TimerRing>
            <View style={styles.distance} accessibilityLabel={`${distance.value} ${distance.unit === "m" ? "meters" : "kilometers"} to go`}>
              <Text variant="hero" color={colors.onMoss} style={styles.distanceValue}>{distance.value}</Text>
              <Text variant="title" color={colors.sprout} style={styles.unit}>{distance.unit}</Text>
            </View>
            <Text variant="small" color={colors.onMossMuted} align="center">
              {heading === null ? "Arrow is north-up · compass unavailable" : `About ${Math.max(1, Math.round(remaining / 75))} min on foot`}
            </Text>
          </>
        )}
      </Animated.View>

      <View style={styles.bottom}>
        <View style={styles.toolbar}>
          {locationDenied ? <Text variant="small" color={colors.warn} style={styles.flex}>Location is off. Turn it on so Ante can see you arrive.</Text> : <View style={styles.flex} />}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showMap ? "Show compass" : "Show map"}
            onPress={() => {
              haptic.select();
              setShowMap(v => !v);
            }}
            style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
          >
            <Text variant="label" color={colors.onMoss}>{showMap ? "Compass" : "Map"}</Text>
          </Pressable>
        </View>
        <LandmarkCard landmark={quest.landmark} />
      </View>
    </Paper>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg, minHeight: touch.min },
  live: { flexDirection: "row", alignItems: "center", gap: space.xs },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.sprout },
  clock: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  hero: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.xs },
  mapWrap: { alignSelf: "stretch", marginHorizontal: space.lg },
  distance: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: space.sm },
  distanceValue: { fontSize: 96, lineHeight: 96 },
  unit: { fontSize: 36, lineHeight: 36 },
  bottom: { paddingHorizontal: space.md, gap: space.sm },
  toolbar: { flexDirection: "row", alignItems: "center", gap: space.sm },
  flex: { flex: 1 },
  toggle: { minHeight: 40, minWidth: 72, paddingHorizontal: space.md, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.mossLine, backgroundColor: colors.mossDeep },
  togglePressed: { backgroundColor: colors.mossLine },
});
