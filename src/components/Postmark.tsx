import { StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Text } from "../theme/Text";
import { colors, fontFamily } from "../theme/tokens";

type Props = { size: number; top: string; middle: string; bottom: string; color?: string; rotate?: number; fill?: string };

export function Postmark({ size, top, middle, bottom, color = colors.leaf, rotate = -12, fill = "rgba(251,249,242,0.6)" }: Props) {
  const c = size / 2;
  return (
    <View style={{ width: size, height: size, transform: [{ rotate: `${rotate}deg` }] }} accessibilityLabel={`Stamped ${top}, ${middle}, ${bottom}`}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={c} cy={c} r={c - 2} stroke={color} strokeWidth={Math.max(2, size * 0.022)} fill={fill} />
        <Circle cx={c} cy={c} r={c - size * 0.07} stroke={color} strokeWidth={1} strokeDasharray="2 3" fill="none" />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={[styles.text, { color, fontSize: size * 0.12, maxWidth: size * 0.68 }]} numberOfLines={1} adjustsFontSizeToFit>{top}</Text>
        <View style={[styles.rule, { backgroundColor: color, width: size * 0.62 }]} />
        <Text style={[styles.text, { color, fontSize: size * 0.22, lineHeight: size * 0.25, maxWidth: size * 0.78 }]} numberOfLines={1} adjustsFontSizeToFit>{middle}</Text>
        <View style={[styles.rule, { backgroundColor: color, width: size * 0.62 }]} />
        <Text style={[styles.text, { color, fontSize: size * 0.12, maxWidth: size * 0.6 }]} numberOfLines={1} adjustsFontSizeToFit>{bottom}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  text: { fontFamily: fontFamily.display, letterSpacing: 1 },
  rule: { height: 1, opacity: 0.6, marginVertical: 1 },
});
