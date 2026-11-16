import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useReducedMotion } from "../theme/motion";
import { colors } from "../theme/tokens";

export function ArmedIndicator({ size, armed }: { size: number; armed: boolean }) {
  const reduced = useReducedMotion();
  const breath = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    breath.setValue(0);
    if (!armed || reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [armed, reduced, breath]);

  const c = size / 2;
  const ring = armed ? colors.leaf : colors.muted;
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={armed ? "Armed" : "Not armed yet"}>
      {armed && (
        <Animated.View
          style={[
            styles.halo,
            { width: size, height: size, borderRadius: c, opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.26] }), transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1] }) }] },
          ]}
        />
      )}
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={c} cy={c} r={c * 0.6} stroke={ring} strokeOpacity={armed ? 0.55 : 0.35} strokeWidth={1.5} strokeDasharray="3 6" fill="none" />
        <Circle cx={c} cy={c} r={c * 0.44} stroke={ring} strokeWidth={2} fill={armed ? colors.leafSoft : "transparent"} />
      </Svg>
      <Animated.View
        style={[
          styles.core,
          {
            left: c - size * 0.12,
            top: c - size * 0.12,
            width: size * 0.24,
            height: size * 0.24,
            borderRadius: size * 0.12,
            backgroundColor: armed ? colors.leaf : colors.rule,
            transform: [{ scale: armed ? breath.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.06] }) : 1 }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  halo: { position: "absolute", backgroundColor: colors.leaf },
  core: { position: "absolute" },
});
