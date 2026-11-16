import { useMemo } from "react";
import { StyleSheet, useWindowDimensions, View, type ViewProps } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "../theme/tokens";

function grain(width: number, height: number, seed: number) {
  let s = seed;
  const next = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const count = Math.round((width * height) / 260);
  return Array.from({ length: count }, () => ({ x: next() * width, y: next() * height, r: 0.35 + next() * 0.6, o: 0.05 + next() * 0.1 }));
}

export function Paper({ tone = "paper", style, children, ...rest }: ViewProps & { tone?: "paper" | "moss" }) {
  const { width, height } = useWindowDimensions();
  const dots = useMemo(() => grain(width, height, tone === "paper" ? 7 : 11), [width, height, tone]);
  const dot = tone === "paper" ? "#6B5F43" : "#000000";
  return (
    <View {...rest} style={[styles.root, { backgroundColor: tone === "paper" ? colors.paper : colors.moss }, style]}>
      <Svg pointerEvents="none" width={width} height={height} style={styles.grain}>
        {dots.map((d, i) => <Circle key={i} cx={d.x} cy={d.y} r={d.r} fill={dot} opacity={d.o} />)}
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 }, grain: { position: "absolute", top: 0, left: 0 } });
