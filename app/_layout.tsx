import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fontAssets } from "../src/theme/fonts";
import { colors } from "../src/theme/tokens";

export default function RootLayout() {
  const [loaded] = useFonts(fontAssets);
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.paper }} />;
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, title: "Ante", contentStyle: { backgroundColor: colors.paper } }} />
    </SafeAreaProvider>
  );
}
