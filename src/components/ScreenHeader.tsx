import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "../theme/Text";
import { colors, space } from "../theme/tokens";
import { IconButton } from "./IconButton";

export function ScreenHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={styles.row}>
      <IconButton icon="chevron-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      <View style={styles.titles}>
        <Text variant="title" numberOfLines={1}>{title}</Text>
        {subtitle && <Text variant="small" color={colors.muted} numberOfLines={1}>{subtitle}</Text>}
      </View>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.xs },
  titles: { flex: 1 },
  right: { minWidth: 48, alignItems: "flex-end" },
});
