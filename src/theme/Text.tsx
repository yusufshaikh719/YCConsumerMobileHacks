import { Text as RNText, type TextProps } from "react-native";
import { colors, type as typeScale, type TypeVariant } from "./tokens";

type Props = TextProps & { variant?: TypeVariant; color?: string; align?: "left" | "center" | "right" };

export function Text({ variant = "body", color = colors.ink, align, style, ...rest }: Props) {
  return <RNText maxFontSizeMultiplier={1.4} {...rest} style={[typeScale[variant], { color }, align && { textAlign: align }, style]} />;
}
