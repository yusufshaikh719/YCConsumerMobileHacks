import { StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { Text } from "../theme/Text";
import { colors, fontFamily } from "../theme/tokens";

type Props = { size: number; top: string; middle: string; bottom: string; color?: string; rotate?: number };

export function Postmark({ size, top, middle, bottom, color = colors.leaf, rotate = -12 }: Props) {
  const c = size / 2;
  const wave = Array.from({ length: 4 }, (_, i) => {
    const y = c - size * 0.12 + i * size * 0.08;
    return `M${size * 0.86} ${y} q${size * 0.06} -${size * 0.04} ${size * 0.12} 0 t${size * 0.12} 0`;
  }).join(" ");
  return (
    <View style={{ width: size, height: size, transform: [{ rotate: `${rotate}deg` }] }} accessibilityLabel={`Stamped ${middle} ${bottom}`}>
      <Svg width={size * 1.2} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={c} cy={c} r={c - 2} stroke={color} strokeWidth={2.5} fill="none" />
        <Circle cx={c} cy={c} r={c - 8} stroke={color} strokeWidth={1} fill="none" />
        <Path d={wave} stroke={color} strokeWidth={1.5} fill="none" />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={[styles.small, { color, fontSize: size * 0.13 }]}>{top}</Text>
        <Text style={[styles.big, { color, fontSize: size * 0.26, lineHeight: size * 0.28 }]} numberOfLines={1}>{middle}</Text>
        <Text style={[styles.small, { color, fontSize: size * 0.13 }]}>{bottom}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  small: { fontFamily: fontFamily.display, letterSpacing: 1.2 },
  big: { fontFamily: fontFamily.display, letterSpacing: 0.5 },
});
