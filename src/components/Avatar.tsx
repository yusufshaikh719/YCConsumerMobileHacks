import { StyleSheet, View } from "react-native";
import type { Member } from "../services/types";
import { Text } from "../theme/Text";
import { colors } from "../theme/tokens";

export function Avatar({ member, size = 32, ring = colors.paper }: { member: Member; size?: number; ring?: string }) {
  return (
    <View style={[styles.base, { width: size, height: size, borderRadius: size / 2, backgroundColor: member.tint, borderColor: ring }]}>
      <Text style={{ fontSize: size * 0.36, lineHeight: size * 0.44 }} variant="bodyStrong" color={colors.white}>{member.initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({ base: { alignItems: "center", justifyContent: "center", borderWidth: 2 } });
