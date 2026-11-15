import { render } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AnteProvider } from "../state/AnteProvider";

const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

export function renderApp(node: ReactNode) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AnteProvider>{node}</AnteProvider>
    </SafeAreaProvider>,
  );
}
