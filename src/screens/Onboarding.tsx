import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../components/Button";
import { OfflineBanner } from "../components/OfflineBanner";
import { Paper } from "../components/Paper";
import { Perforation } from "../components/Perforation";
import { Postmark } from "../components/Postmark";
import { WindowEditor } from "../components/WindowEditor";
import { haptic } from "../lib/haptics";
import { money } from "../lib/money";
import { parseInviteCode } from "../lib/windows";
import { ante } from "../services";
import type { FreeWindow } from "../services/types";
import { useAnte } from "../state/AnteProvider";
import { Text } from "../theme/Text";
import { colors, radius, space, touch } from "../theme/tokens";

type Mode = "keep" | "create" | "join";

const JOIN_ERRORS = {
  invalid: "That doesn't look like an invite code. It's the 6 letters and numbers at the end of the link.",
  not_found: "We couldn't find that group. Check the code with the friend who sent it, it's the 6 letters and numbers at the end of the link.",
  offline: "We couldn't find that group. This phone is in offline mode, so it can't see groups made on other phones.",
} as const;

export function Onboarding({ inviteCode, onDone }: { inviteCode?: string; onDone: () => void }) {
  const { data } = useAnte();
  const insets = useSafeAreaInsets();
  const me = data.group.members.find(m => m.id === data.meId);
  const [step, setStep] = useState<"group" | "windows">("group");
  const [mode, setMode] = useState<Mode>(inviteCode ? "join" : data.onboarded ? "keep" : "create");
  const [name, setName] = useState(me?.fullName === "You" ? "" : me?.fullName ?? "");
  const [groupName, setGroupName] = useState("");
  const [code, setCode] = useState(inviteCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [windows, setWindows] = useState<FreeWindow[]>(data.windows);
  const first = name.trim().split(/\s+/)[0];
  const synced = data.backend === "convex";

  const toWindows = async () => {
    try {
      if (name.trim()) await ante.setName(name);
      if (mode === "create") await ante.createGroup(groupName);
      if (mode === "join") {
        const result = await ante.joinGroup(code);
        if (result !== "joined") {
          setError(JOIN_ERRORS[result]);
          return;
        }
      }
    } catch {
      setError("Couldn't reach the group server. Check your connection and try again.");
      return;
    }
    haptic.select();
    setError(null);
    setStep("windows");
  };

  const finish = async () => {
    await ante.setWindows(windows);
    await ante.finishOnboarding();
    haptic.success();
    onDone();
  };

  const options: { mode: Mode; title: string; body: string }[] = [
    ...(data.onboarded ? [{ mode: "keep" as const, title: `Stay in ${data.group.name}`, body: `Invite code ${data.group.inviteCode}` }] : []),
    { mode: "create", title: "Start a group", body: `You set the race. Friends join with your link and put ${money(data.stakeCents)} in.` },
    { mode: "join", title: "Join with a code", body: "Paste the invite link or type the code a friend sent you." },
  ];

  return (
    <Paper style={{ paddingTop: insets.top }}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + space.xl, gap: space.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.flex}>
                <Text variant="label" color={colors.leaf}>Step {step === "group" ? 1 : 2} of 2</Text>
                <Text variant="display">{step === "group" ? "Pick your crew." : "When are you free?"}</Text>
              </View>
              <Postmark size={84} top="ANTE" middle={step === "group" ? "CREW" : "WINDOWS"} bottom={step === "group" ? "STEP 1" : "STEP 2"} rotate={-8} fill="transparent" />
            </View>
            <Text variant="body" color={colors.inkSoft}>
              {step === "group"
                ? "One surprise sidequest a day. Walk to a nearby landmark, stamp your passport, and race your group for the pot."
                : "Add the times you could drop everything for a short walk. Ante pings you at one random minute inside them."}
            </Text>
            <Perforation color={colors.paper} edge="bottom" count={22} />
          </View>

          {!synced && <OfflineBanner />}
          {step === "group" ? (
            <>
              <View style={styles.field}>
                <Text variant="label" color={colors.muted}>Your name</Text>
                <TextInput accessibilityLabel="Your name" value={name} onChangeText={setName} placeholder="On your passport and invites" placeholderTextColor={colors.muted} maxLength={40} autoCapitalize="words" autoCorrect={false} style={styles.input} />
              </View>

              <View style={styles.options}>
                {options.map(o => {
                  const active = o.mode === mode;
                  return (
                    <Pressable key={o.mode} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => { haptic.select(); setMode(o.mode); setError(null); }} style={[styles.option, active && styles.optionActive]}>
                      <View style={[styles.radio, active && styles.radioActive]} />
                      <View style={styles.flex}>
                        <Text variant="bodyStrong" color={active ? colors.leaf : colors.ink}>{o.title}</Text>
                        <Text variant="small" color={colors.muted}>{o.body}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {mode === "create" && (
                <View style={styles.field}>
                  <Text variant="label" color={colors.muted}>Group name</Text>
                  <TextInput accessibilityLabel="Group name" value={groupName} onChangeText={setGroupName} placeholder={first ? `${first}'s group` : "Your group"} placeholderTextColor={colors.muted} maxLength={40} autoCorrect={false} style={styles.input} />
                </View>
              )}
              {mode === "join" && (
                <View style={styles.field}>
                  <Text variant="label" color={colors.muted}>Invite code</Text>
                  <TextInput accessibilityLabel="Invite code" value={code} onChangeText={value => { setCode(value); setError(null); }} placeholder="ante://join/ABC123" placeholderTextColor={colors.muted} autoCapitalize="characters" autoCorrect={false} style={styles.input} />
                  {!error && <Text variant="small" color={colors.muted}>{synced ? "You'll join their group on every phone and see each other's stamps live." : "Offline mode: joining a friend's group needs the group server."}</Text>}
                </View>
              )}

              {error && mode !== "keep" && <Text variant="small" color={colors.warn}>{error}</Text>}
              <Button label="Next: your windows" onPress={() => void toWindows()} />
            </>
          ) : (
            <>
              <WindowEditor windows={windows} onChange={setWindows} />
              <Button label={data.onboarded ? "Save" : "Start playing"} onPress={() => void finish()} />
              <Button kind="quiet" label="Back" onPress={() => setStep("group")} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Paper>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { marginTop: space.sm, padding: space.lg, gap: space.sm, backgroundColor: colors.card, borderRadius: radius.sm, shadowColor: "#3B3424", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  field: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cardEdge, padding: space.md, gap: space.xxs },
  input: { minHeight: touch.min, fontSize: 20, color: colors.ink, paddingVertical: space.xxs },
  options: { gap: space.xs },
  option: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 64, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardEdge, backgroundColor: colors.card },
  optionActive: { borderColor: colors.leaf, backgroundColor: colors.leafSoft },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.rule },
  radioActive: { borderColor: colors.leaf, borderWidth: 6 },
});
