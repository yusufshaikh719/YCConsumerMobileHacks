import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../src/components/Button";
import { Paper } from "../src/components/Paper";
import { ScreenHeader } from "../src/components/ScreenHeader";
import { WindowEditor } from "../src/components/WindowEditor";
import { haptic } from "../src/lib/haptics";
import { sameWindows } from "../src/lib/windows";
import { ante } from "../src/services";
import type { FreeWindow } from "../src/services/types";
import { useAnte } from "../src/state/AnteProvider";
import { Text } from "../src/theme/Text";
import { colors, radius, space, touch } from "../src/theme/tokens";

export default function Settings() {
  const { data } = useAnte();
  const insets = useSafeAreaInsets();
  const me = data.group.members.find(m => m.id === data.meId);
  const savedName = me?.fullName === "You" ? "" : me?.fullName ?? "";
  const [name, setName] = useState(savedName);
  const [windows, setWindows] = useState<FreeWindow[]>(data.windows);
  const windowsChanged = !sameWindows(windows, data.windows);
  const nameChanged = name.trim() !== savedName;
  const changed = windowsChanged || nameChanged;

  return (
    <Paper style={{ paddingTop: insets.top }}>
      <StatusBar style="dark" />
      <ScreenHeader title="Settings" subtitle="Your name, group, and sidequest windows" />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + space.xl, gap: space.lg }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text variant="label" color={colors.muted}>Your name</Text>
          <TextInput
            accessibilityLabel="Your name"
            value={name}
            onChangeText={setName}
            placeholder="On your passport and invites"
            placeholderTextColor={colors.muted}
            maxLength={40}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            style={styles.input}
          />
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Change group" onPress={() => router.push("/onboarding")} style={({ pressed }) => [styles.card, styles.group, pressed && styles.pressed]}>
          <View style={styles.flex}>
            <Text variant="label" color={colors.muted}>Group</Text>
            <Text variant="bodyStrong">{data.group.name}</Text>
            <Text variant="small" color={colors.muted}>Invite code {data.group.inviteCode}</Text>
            <Text variant="small" color={colors.muted}>{data.backend === "convex" ? "Synced across phones. Demo identity: your name and this phone, no account." : "Offline mode: this phone only."}</Text>
          </View>
          <Text variant="bodyStrong" color={colors.leaf}>Change ›</Text>
        </Pressable>

        <View style={styles.section}>
          <Text variant="label" color={colors.muted}>Sidequest windows</Text>
          <WindowEditor windows={windows} onChange={setWindows} />
        </View>

        <Button
          label={changed ? "Save" : "Done"}
          onPress={() => {
            if (changed) haptic.success();
            if (windowsChanged) void ante.setWindows(windows);
            if (nameChanged) void ante.setName(name);
            router.back();
          }}
        />
      </ScrollView>
    </Paper>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cardEdge, padding: space.md, gap: space.xxs },
  input: { minHeight: touch.min, fontSize: 20, color: colors.ink, paddingVertical: space.xxs },
  group: { flexDirection: "row", alignItems: "center", gap: space.sm },
  flex: { flex: 1, gap: 2 },
  section: { gap: space.sm },
  pressed: { opacity: 0.7 },
});
