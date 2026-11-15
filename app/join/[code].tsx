import { useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import { BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold } from "@expo-google-fonts/barlow-condensed";
import { Inter_400Regular, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Availability, FlowText as Text, FontFallback, JoinByCode } from "../../src/components/GroupFlows";

function GroupUsers({ potId, selected, onSelect }: { potId: Id<"pots">; selected: Id<"users"> | null; onSelect: (id: Id<"users">) => void }) {
  const dashboard = useQuery(api.pots.getPotDashboard, { potId });
  if (!dashboard || !dashboard.leaderboard.length) return null;
  return <View style={styles.roster}><Text style={styles.label}>{dashboard.pot.title}</Text>{dashboard.leaderboard.map(member => member.user ? <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected === member.userId }} key={member.userId} onPress={() => onSelect(member.userId)} style={[styles.user, selected === member.userId && styles.selected]}><Text style={[styles.userText, selected === member.userId && styles.selectedText]}>{member.user.name} · @{member.user.handle}{selected === member.userId ? "  ✓" : ""}</Text></Pressable> : null)}</View>;
}

export default function JoinRoute() {
  const params = useLocalSearchParams<{ code: string | string[] }>();
  const code = Array.isArray(params.code) ? params.code[0] : params.code ?? "";
  const router = useRouter();
  const pots = useQuery(api.pots.listActivePots, {});
  const [fontsLoaded, fontError] = useFonts({ BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold, Inter_400Regular, Inter_600SemiBold });
  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const [joinedPot, setJoinedPot] = useState<Id<"pots"> | null>(null);
  if (!fontsLoaded && !fontError) return <SafeAreaView style={styles.safe}><ActivityIndicator color="#0B1B3F" /></SafeAreaView>;
  return <FontFallback.Provider value={!!fontError}><SafeAreaView style={styles.safe} edges={["top", "bottom"]}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace("/")}><Text style={styles.back}>← BACK</Text></Pressable>
    <Text style={styles.eyebrow}>ANTE / INVITATION</Text><Text style={styles.title}>YOU'RE INVITED.</Text>
    <Text style={styles.body}>Choose an existing player from an active group, then review the invite and join. Payment is verified separately by Whop.</Text>
    <View style={styles.card}><Text style={styles.heading}>SELECT DEMO IDENTITY</Text><Text style={styles.body}>This is an unauthenticated demo player selector, not a sign-in. Players shown are from existing active group rosters.</Text>
      {pots === undefined ? <ActivityIndicator color="#0B1B3F" /> : pots.length === 0 ? <Text style={styles.body}>No active groups are available. Open Ante to select an existing player first.</Text> : pots.map(pot => <GroupUsers key={pot._id} potId={pot._id} selected={userId} onSelect={id => { setUserId(id); setJoinedPot(null); }} />)}
    </View>
    {userId ? <JoinByCode key={`${userId}:${code}`} userId={userId} initialCode={code} onJoined={setJoinedPot} /> : <Text style={styles.body}>Select a player to continue.</Text>}
    {userId && joinedPot ? <Availability key={`${joinedPot}:${userId}`} potId={joinedPot} userId={userId} /> : null}
    <Text style={styles.footer}>ANTE POWERED BY WHOP</Text>
  </ScrollView></SafeAreaView></FontFallback.Provider>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4F3EF" }, content: { padding: 20, paddingBottom: 48, gap: 12 }, back: { color: "#0B1B3F", fontFamily: "BarlowCondensed_700Bold", fontSize: 15, letterSpacing: 1 }, eyebrow: { color: "#FF4D2E", fontFamily: "BarlowCondensed_700Bold", fontSize: 13, letterSpacing: 2, marginTop: 14 }, title: { color: "#0B1B3F", fontFamily: "BarlowCondensed_800ExtraBold", fontSize: 42, lineHeight: 44 }, heading: { color: "#0B1B3F", fontFamily: "BarlowCondensed_800ExtraBold", fontSize: 25 }, body: { color: "#3A4766", fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20 }, card: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E3E1DA", padding: 18, gap: 8, elevation: 1 }, roster: { gap: 5, marginTop: 8 }, label: { color: "#737A8C", fontFamily: "BarlowCondensed_700Bold", fontSize: 13, letterSpacing: 1 }, user: { backgroundColor: "#F4F3EF", padding: 12 }, selected: { backgroundColor: "#0B1B3F" }, userText: { color: "#0B1B3F", fontFamily: "Inter_600SemiBold", fontSize: 13 }, selectedText: { color: "#FFFFFF" }, footer: { color: "#737A8C", textAlign: "center", fontSize: 10, letterSpacing: 1.3, marginTop: 12 },
});
