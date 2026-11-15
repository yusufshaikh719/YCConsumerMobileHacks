import { StyleSheet, Text, View } from "react-native";

export default function Home() {
  return <View style={styles.root}><Text style={styles.title}>Ante</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F3EFE4" },
  title: { fontSize: 32, fontWeight: "800", color: "#1D1F1A" },
});
