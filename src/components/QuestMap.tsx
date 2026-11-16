import { Linking, StyleSheet, View } from "react-native";
import { loadMaps, walkingDirectionsUrl } from "../lib/maps";
import type { LatLng } from "../services/types";
import { Text } from "../theme/Text";
import { colors, radius, space } from "../theme/tokens";
import { Button } from "./Button";

const toMap = ({ lat, lng }: LatLng) => ({ latitude: lat, longitude: lng });

export function QuestMap({ you, target, title }: { you: LatLng; target: LatLng; title: string }) {
  const maps = loadMaps();
  if (!maps) {
    return (
      <View style={[styles.frame, styles.fallback]}>
        <Text variant="bodyStrong" align="center">The map isn't available in this build</Text>
        <Text variant="small" color={colors.muted} align="center">The compass still points the way. You can also open walking directions in your maps app.</Text>
        <Button kind="quiet" label="Open in Maps" onPress={() => void Linking.openURL(walkingDirectionsUrl(target)).catch(() => undefined)} />
      </View>
    );
  }
  const { default: MapView, Marker, Polyline } = maps;
  const latitudeDelta = Math.max(0.006, Math.abs(you.lat - target.lat) * 2.4);
  const longitudeDelta = Math.max(0.006, Math.abs(you.lng - target.lng) * 2.4);
  return (
    <View style={styles.frame}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: (you.lat + target.lat) / 2, longitude: (you.lng + target.lng) / 2, latitudeDelta, longitudeDelta }}
        showsUserLocation
        showsCompass={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        accessibilityLabel={`Map to ${title}`}
      >
        <Polyline coordinates={[toMap(you), toMap(target)]} strokeColor={colors.moss} strokeWidth={4} lineDashPattern={[2, 10]} />
        <Marker coordinate={toMap(target)} title={title} pinColor={colors.leaf} />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, overflow: "hidden", borderRadius: radius.lg, backgroundColor: colors.card },
  fallback: { alignItems: "center", justifyContent: "center", gap: space.sm, padding: space.lg, borderWidth: 1, borderColor: colors.cardEdge },
});
