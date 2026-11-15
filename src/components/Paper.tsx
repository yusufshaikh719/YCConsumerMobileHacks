import { useMemo } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "../theme/tokens";

function grain(count: number, seed: number) {
  let s = seed;
  const next = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: count }, () => ({ x: next() * 100, y: next() * 100, r: 0.12 + next() * 0.22, o: 0.05 + next() * 0.09 }));
}

export function Paper({ tone = "paper", style, children, ...rest }: ViewProps & { tone?: "paper" | "moss" }) {
  const dots = useMemo(() => grain(tone === "paper" ? 900 : 500, tone === "paper" ? 7 : 11), [tone]);
  const dot = tone === "paper" ? "#6B5F43" : "#000000";
  return (
    <View {...rest} style={[styles.root, { backgroundColor: tone === "paper" ? colors.paper : colors.moss }, style]}>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
        {dots.map((d, i) => <Circle key={i} cx={d.x} cy={d.y} r={d.r} fill={dot} opacity={d.o} />)}
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
