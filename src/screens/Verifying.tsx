import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { Paper } from "../components/Paper";
import { Perforation } from "../components/Perforation";
import { myQuestPhoto } from "../services/fixtures";
import type { Sidequest } from "../services/types";
import { useReducedMotion } from "../theme/motion";
import { Text } from "../theme/Text";
import { colors, radius, space } from "../theme/tokens";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function Verifying({ quest, photoUri }: { quest: Sidequest; photoUri: string | null }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const steps = ["Checking you're at the spot", `Looking for ${quest.landmark.name}`, "Inking your stamp"];
  const [step, setStep] = useState(0);
  const draw = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setInterval(() => setStep(s => Math.min(s + 1, steps.length - 1)), 900);
    return () => clearInterval(timer);
  }, [steps.length]);

  useEffect(() => {
    if (reduced) return;
    const loops = [
      Animated.loop(Animated.timing(draw, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.cubic), useNativeDriver: false })),
      Animated.loop(Animated.timing(spin, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true })),
    ];
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [draw, spin, reduced]);

  const cardWidth = Math.min(width - space.xl * 2, 320);
  const stamp = 96;
  const r = stamp / 2 - 4;
  const circumference = 2 * Math.PI * r;
  return (
    <Paper style={{ paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg }}>
      <StatusBar style="dark" />
      <View style={styles.center}>
        <View style={[styles.card, { width: cardWidth }]}>
          <Image source={photoUri ? { uri: photoUri } : myQuestPhoto} style={[styles.photo, { height: cardWidth * 1.15 }]} />
          <View style={styles.caption}>
            <Text variant="bodyStrong">{quest.landmark.name}</Text>
            <Text variant="small" color={colors.muted}>{quest.landmark.neighborhood}</Text>
          </View>
          <Perforation color={colors.paper} edge="top" count={20} />
          <Perforation color={colors.paper} edge="bottom" count={20} />
          <Animated.View style={[styles.stamp, { width: stamp, height: stamp, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }]}>
            <Svg width={stamp} height={stamp}>
              <Circle cx={stamp / 2} cy={stamp / 2} r={r} stroke={colors.leaf} strokeOpacity={0.18} strokeWidth={3} fill="rgba(251,249,242,0.9)" />
              <AnimatedCircle
                cx={stamp / 2}
                cy={stamp / 2}
                r={r}
                stroke={colors.leaf}
                strokeWidth={3}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={reduced ? circumference * 0.3 : draw.interpolate({ inputRange: [0, 1], outputRange: [circumference, -circumference] })}
              />
              <Circle cx={stamp / 2} cy={stamp / 2} r={r - 10} stroke={colors.leaf} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="2 5" fill="none" />
            </Svg>
          </Animated.View>
        </View>
      </View>
      <View style={styles.status} accessibilityLiveRegion="polite">
        <Text variant="label" color={colors.leaf}>Verifying</Text>
        <Text variant="title" align="center">{steps[step]}</Text>
        <View style={styles.dots}>
          {steps.map((_, i) => <View key={i} style={[styles.dot, i <= step && styles.dotOn]} />)}
        </View>
      </View>
    </Paper>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: colors.card, padding: 12, borderRadius: radius.sm, transform: [{ rotate: "-1.5deg" }], shadowColor: "#3B3424", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  photo: { width: "100%", borderRadius: 3 },
  caption: { paddingTop: space.sm, paddingBottom: 2 },
  stamp: { position: "absolute", right: 14, bottom: 18 },
  status: { alignItems: "center", gap: space.xs, paddingHorizontal: space.lg, minHeight: 110 },
  dots: { flexDirection: "row", gap: 6, marginTop: space.xs },
  dot: { width: 22, height: 4, borderRadius: 2, backgroundColor: colors.rule },
  dotOn: { backgroundColor: colors.leaf },
});
