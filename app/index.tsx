import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { Paper } from "../src/components/Paper";
import { Ping } from "../src/screens/Ping";
import { QuestLive } from "../src/screens/QuestLive";
import { useAnte } from "../src/state/AnteProvider";
import { Text } from "../src/theme/Text";
import { colors } from "../src/theme/tokens";

export default function Home() {
  const { phase } = useAnte();
  if (phase.name === "ping") return <Ping key={phase.quest.id} quest={phase.quest} />;
  if (phase.name === "live") return <QuestLive key={phase.quest.id} quest={phase.quest} />;
  return (
    <Paper>
      <StatusBar style="dark" />
      <View style={styles.center}>
        <Text variant="hero" color={colors.ink}>{phase.name.toUpperCase()}</Text>
      </View>
    </Paper>
  );
}

const styles = StyleSheet.create({ center: { flex: 1, alignItems: "center", justifyContent: "center" } });
