import { Pressable, StyleSheet } from "react-native";
import { haptic } from "../lib/haptics";
import { Text } from "../theme/Text";
import { colors, radius, space, touch } from "../theme/tokens";

type Props = { label: string; onPress: () => void; kind?: "primary" | "quiet" };

export function Button({ label, onPress, kind = "primary" }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptic.light();
        onPress();
      }}
      style={({ pressed }) => [styles.base, kind === "primary" ? styles.primary : styles.quiet, pressed && styles.pressed]}
    >
      <Text variant="bodyStrong" color={kind === "primary" ? colors.paper : colors.ink}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: touch.large, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg },
  primary: { backgroundColor: colors.ink },
  quiet: { borderWidth: 1.5, borderColor: colors.rule },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
