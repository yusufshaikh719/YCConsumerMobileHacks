import { StyleSheet, Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Stakes</Text>
      <Text style={styles.subtitle}>Make habits together. Keep each other accountable.</Text>
      <Text style={styles.note}>The habit pot experience is coming soon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#111827" },
  title: { color: "#fff", fontSize: 36, fontWeight: "700" },
  subtitle: { color: "#d1d5db", fontSize: 16, marginTop: 12, textAlign: "center" },
  note: { color: "#9ca3af", marginTop: 24, textAlign: "center" },
});
