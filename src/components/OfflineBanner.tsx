import { StyleSheet, View } from "react-native";
import { Text } from "../theme/Text";
import { colors, radius, space } from "../theme/tokens";

export function OfflineBanner() {
  return (
    <View accessibilityRole="alert" style={styles.banner}>
      <Text variant="bodyStrong" color={colors.warn}>Offline mode: not synced</Text>
      <Text variant="small" color={colors.inkSoft}>This phone isn't connected to the group server. Groups, codes, and stamps stay on this phone only, so friends can't join you and you can't join them.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { padding: space.md, gap: 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.warn, backgroundColor: colors.card },
});
