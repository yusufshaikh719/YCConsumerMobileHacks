import { StyleSheet, View } from "react-native";
import { Photo } from "./Photo";
import type { Landmark } from "../services/types";
import { Text } from "../theme/Text";
import { colors, radius, space } from "../theme/tokens";

export function LandmarkCard({ landmark }: { landmark: Landmark }) {
  return (
    <View style={styles.card}>
      <Photo source={landmark.thumbnail} style={styles.thumb} icon="location-outline" />
      <View style={styles.body}>
        <Text variant="label" color={colors.leaf}>{landmark.neighborhood}</Text>
        <Text variant="heading" numberOfLines={1}>{landmark.name}</Text>
        <Text variant="small" color={colors.inkSoft} numberOfLines={3}>{landmark.trivia}</Text>
        <Text variant="small" color={colors.muted} style={styles.source}>via {landmark.source}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", gap: space.md, padding: space.md, backgroundColor: colors.paper, borderRadius: radius.lg },
  thumb: { width: 76, height: 96, borderRadius: radius.sm, backgroundColor: colors.cardEdge },
  body: { flex: 1, gap: 2 },
  source: { marginTop: 2, fontSize: 12 },
});
