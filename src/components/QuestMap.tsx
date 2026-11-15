import { StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import type { LatLng } from "../services/types";
import { colors, radius } from "../theme/tokens";

const toMap = ({ lat, lng }: LatLng) => ({ latitude: lat, longitude: lng });

export function QuestMap({ you, target, title }: { you: LatLng; target: LatLng; title: string }) {
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
});
