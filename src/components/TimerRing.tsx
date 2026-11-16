import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import { colors } from "../theme/tokens";

type Props = { size: number; progress: number; children?: ReactNode; stroke?: number };

export function TimerRing({ size, progress, children, stroke = 10 }: Props) {
  const r = (size - stroke) / 2 - 6;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const ticks = Array.from({ length: 60 }, (_, i) => i);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {ticks.map(i => {
          const a = (i / 60) * 2 * Math.PI;
          const inner = r - stroke / 2 - (i % 5 === 0 ? 12 : 7);
          const outer = r - stroke / 2 - 3;
          return <Line key={i} x1={c + inner * Math.sin(a)} y1={c - inner * Math.cos(a)} x2={c + outer * Math.sin(a)} y2={c - outer * Math.cos(a)} stroke={colors.onMossMuted} strokeOpacity={i % 5 === 0 ? 0.55 : 0.22} strokeWidth={i % 5 === 0 ? 2 : 1} />;
        })}
        <Circle cx={c} cy={c} r={r} stroke={colors.mossLine} strokeWidth={stroke} fill="none" />
        <Circle
          cx={c}
          cy={c}
          r={r}
          stroke={progress > 0.15 ? colors.sprout : colors.warn}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - Math.max(0, Math.min(1, progress)))}
          transform={`rotate(-90 ${c} ${c})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: "center", justifyContent: "center" } });
