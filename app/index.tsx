import { StyleSheet, View } from "react-native";
import { Paper } from "../src/components/Paper";
import { Text } from "../src/theme/Text";
import { colors } from "../src/theme/tokens";

export default function Home() {
  return (
    <Paper>
      <View style={styles.center}>
        <Text variant="hero">ANTE</Text>
        <Text variant="label" color={colors.muted}>Sidequests, weekly pot</Text>
      </View>
    </Paper>
  );
}

const styles = StyleSheet.create({ center: { flex: 1, alignItems: "center", justifyContent: "center" } });
