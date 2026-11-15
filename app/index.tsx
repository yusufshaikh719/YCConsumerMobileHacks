import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { Paper } from "../src/components/Paper";
import { useAnte } from "../src/state/AnteProvider";
import { Text } from "../src/theme/Text";
import { colors } from "../src/theme/tokens";

export default function Home() {
  const { phase } = useAnte();
  const dark = phase.name === "ping" || phase.name === "live";
  return (
    <Paper tone={dark ? "moss" : "paper"}>
      <StatusBar style={dark ? "light" : "dark"} />
      <View style={styles.center}>
        <Text variant="hero" color={dark ? colors.onMoss : colors.ink}>{phase.name.toUpperCase()}</Text>
      </View>
    </Paper>
  );
}

const styles = StyleSheet.create({ center: { flex: 1, alignItems: "center", justifyContent: "center" } });
