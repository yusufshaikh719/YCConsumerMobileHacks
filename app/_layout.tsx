import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DevSwitcher } from "../src/dev/DevSwitcher";
import { AnteProvider } from "../src/state/AnteProvider";
import { fontAssets } from "../src/theme/fonts";
import { colors } from "../src/theme/tokens";

export default function RootLayout() {
  const [loaded] = useFonts(fontAssets);
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.paper }} />;
  return (
    <SafeAreaProvider>
      <AnteProvider>
        <Stack screenOptions={{ headerShown: false, title: "Ante", contentStyle: { backgroundColor: colors.paper }, animation: "slide_from_right" }} />
        <DevSwitcher />
      </AnteProvider>
    </SafeAreaProvider>
  );
}
