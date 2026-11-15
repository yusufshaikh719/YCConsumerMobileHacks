import { StyleSheet, View } from "react-native";

export function Perforation({ color, edge, count = 18, size = 8 }: { color: string; edge: "top" | "bottom"; count?: number; size?: number }) {
  return (
    <View pointerEvents="none" style={[styles.row, edge === "top" ? { top: -size / 2 } : { bottom: -size / 2 }]}>
      {Array.from({ length: count }, (_, i) => <View key={i} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />)}
    </View>
  );
}

const styles = StyleSheet.create({ row: { position: "absolute", left: 6, right: 6, flexDirection: "row", justifyContent: "space-between" } });
