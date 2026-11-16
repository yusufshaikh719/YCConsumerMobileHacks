import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet } from "react-native";
import { haptic } from "../lib/haptics";
import { colors, radius, touch } from "../theme/tokens";

type Props = { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; tone?: "paper" | "moss" };

export function IconButton({ icon, label, onPress, tone = "paper" }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed }) => [styles.base, tone === "moss" && styles.moss, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={22} color={tone === "moss" ? colors.onMoss : colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { width: touch.min, height: touch.min, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge },
  moss: { backgroundColor: colors.mossDeep, borderColor: colors.mossLine },
  pressed: { opacity: 0.6 },
});
