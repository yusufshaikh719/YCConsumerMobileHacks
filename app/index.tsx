import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { WebView } from "react-native-webview";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { WhopCheckoutResult } from "../src/services/whop";
import PotArena from "../src/components/PotArena";
import LiveCamera from "../src/components/LiveCamera";
import WhopChat from "../src/components/WhopChat";
import DemoDrawer from "../src/components/DemoDrawer";

const lime = "#C8FF2E";
const tap = () => { if (Platform.OS !== "web") void Haptics.selectionAsync(); };

export default function HomeScreen() {
  const pots = useQuery(api.pots.listActivePots, {});
  const seed = useMutation(api.demo.seedStageDemoPot);
  const [potId, setPotId] = useState<Id<"pots"> | null>(null);
  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const dashboard = useQuery(api.pots.getPotDashboard, potId ? { potId } : "skip");
  const [tab, setTab] = useState<"arena" | "camera" | "chat">("arena");
  const [selector, setSelector] = useState<"pot" | "player" | null>(null);
  const [demo, setDemo] = useState(false);
  const [create, setCreate] = useState(false);
  const [error, setError] = useState("");
  const seeded = useRef(false);

  useEffect(() => {
    if (!pots || potId) return;
    if (pots.length) { setPotId((pots.find(p => p.whopProductId === "demo_whop_product_gym_pact") ?? pots[0])._id); return; }
    if (!seeded.current) {
      seeded.current = true;
      void seed({}).then(result => setPotId(result.potId)).catch(e => setError(String(e)));
    }
  }, [pots, potId, seed]);
  useEffect(() => {
    if (!dashboard) return;
    if (!dashboard.leaderboard.some(member => member.userId === userId)) setUserId(dashboard.leaderboard[0]?.userId ?? null);
  }, [dashboard, userId]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (selector) { setSelector(null); return true; }
      if (tab !== "arena") { setTab("arena"); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [selector, tab]);
  const active = dashboard?.leaderboard.find(member => member.userId === userId);
  const choosePot = (id: Id<"pots">) => { tap(); setPotId(id); setSelector(null); setTab("arena"); };

  return <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
    <View style={styles.shell}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logo}><Text style={styles.logoText}>S</Text></View><Text style={styles.brand}>stakes.</Text>
          <Pressable onPress={() => { tap(); setSelector(selector === "pot" ? null : "pot"); }} style={styles.potSelect}><Text numberOfLines={1} style={styles.potSelectText}>{dashboard?.pot.title ?? "Your pots"}  ⌄</Text></Pressable>
        </View>
        <View style={styles.contextRow}>
          <Pressable onPress={() => { tap(); setSelector(selector === "player" ? null : "player"); }} style={styles.player}><View style={styles.avatar}><Text style={styles.avatarText}>{active?.user?.name?.[0] ?? "?"}</Text></View><Text style={styles.playerText}>{active?.user?.name ?? "Player"}  ⌄</Text></Pressable>
          <View style={styles.wallet}><Text style={styles.walletText}>Wallet (sim.) · <Text style={styles.walletValue}>${((active?.user?.simulatedWalletBalanceCents ?? 0) / 100).toFixed(2)}</Text></Text></View>
          <Pressable onPress={() => { tap(); setDemo(true); }} style={styles.demo}><Text style={styles.demoText}>STAGE DEMO</Text></Pressable>
        </View>
        {selector === "pot" && <View style={styles.dropdown}>{pots?.map(p => <Pressable key={p._id} style={styles.option} onPress={() => choosePot(p._id)}><Text style={styles.optionText}>{p.title}</Text></Pressable>)}<Pressable style={styles.option} onPress={() => { setSelector(null); setCreate(true); }}><Text style={styles.optionAccent}>+ New $10 Pot</Text></Pressable></View>}
        {selector === "player" && <View style={styles.dropdown}>{dashboard?.leaderboard.map(member => <Pressable key={member.userId} style={styles.option} onPress={() => { tap(); setUserId(member.userId); setSelector(null); }}><Text style={styles.optionText}>{member.user?.name ?? "Player"}{member.userId === userId ? "  ✓" : ""}</Text></Pressable>)}</View>}
      </View>
      {!potId || !dashboard || !userId ? <View style={styles.loading}><ActivityIndicator color={lime} /><Text style={styles.muted}>{error || "Opening your arena..."}</Text>{error ? <Pressable onPress={() => void seed({}).then(r => { setPotId(r.potId); setError(""); }).catch(e => setError(String(e)))}><Text style={styles.optionAccent}>Seed stage demo</Text></Pressable> : null}</View> : <>
        <View style={styles.content}>{tab === "arena" ? <PotArena potId={potId} userId={userId} onCamera={() => setTab("camera")} onCreate={() => setCreate(true)} onDemo={() => setDemo(true)} /> : tab === "camera" ? <LiveCamera key={`${potId}:${userId}`} potId={potId} userId={userId} allowSimulatedDemo={dashboard.pot.whopProductId === "demo_whop_product_gym_pact"} onClose={() => setTab("arena")} /> : <WhopChat potId={potId} />}</View>
        <View style={styles.tabs}>{([['arena', '◉', 'Arena'], ['camera', '◎', 'Prove'], ['chat', '▤', 'Chat']] as const).map(([id, icon, label]) => <Pressable key={id} style={styles.tab} onPress={() => { tap(); setTab(id); }}><Text style={[styles.tabIcon, tab === id && styles.selected]}>{icon}</Text><Text style={[styles.tabLabel, tab === id && styles.selected]}>{label}</Text></Pressable>)}</View>
        <DemoDrawer potId={potId} visible={demo} onClose={() => setDemo(false)} onReset={id => { setPotId(id); setTab("arena"); }} />
        <CreatePotSheet visible={create} onClose={() => setCreate(false)} userId={userId} onCreated={id => { setPotId(id); setTab("arena"); }} />
      </>}
    </View>
  </SafeAreaView>;
}

function CreatePotSheet({ visible, onClose, userId, onCreated }: { visible: boolean; onClose: () => void; userId: Id<"users">; onCreated: (id: Id<"pots">) => void }) {
  const createPot = useMutation(api.pots.createPot);
  const join = useMutation(api.pots.joinPotPendingCheckout);
  const checkoutAction = useAction(api.whop.createPotCheckout);
  const [title, setTitle] = useState("");
  const [habit, setHabit] = useState("");
  const [checkout, setCheckout] = useState<WhopCheckoutResult | null>(null);
  const [created, setCreated] = useState<Id<"pots"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const start = async () => {
    if (!title.trim() || !habit.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const id = created ?? await createPot({ title, habitCategory: "custom", habitPrompt: habit, createdByUserId: userId, stakeCents: 1000 });
      setCreated(id);
      await join({ potId: id, userId });
      const result: WhopCheckoutResult = await checkoutAction({ potId: id, userId });
      setCheckout(result);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const close = () => { if (created) onCreated(created); onClose(); setCheckout(null); setCreated(null); setTitle(""); setHabit(""); setError(""); };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={close}><View style={styles.modalBackdrop}><View style={styles.sheet}><View style={styles.sheetHead}><Text style={styles.sheetTitle}>{checkout ? "Whop checkout" : "Create a pot"}</Text><Pressable onPress={close}><Text style={styles.close}>✕</Text></Pressable></View>
    {checkout?.checkoutUrl && Platform.OS !== "web" ? <View style={{ height: 450 }}><WebView source={{ uri: checkout.checkoutUrl }} /></View> : checkout ? <View style={styles.checkout}><Text style={styles.checkoutBadge}>WHOP  /  {checkout.mode === "fallback" ? "SANDBOX" : "CHECKOUT"}</Text><Text style={styles.checkoutTitle}>Your weekly stake</Text><Text style={styles.price}>$10.00</Text><Text style={styles.muted}>{checkout.checkoutUrl ? "Continue to Whop to complete your secure checkout." : "Sandbox preview · No payment was collected. Your membership remains pending until a verified Whop payment is received."}</Text>{checkout.checkoutUrl ? <Pressable style={styles.primary} onPress={() => void Linking.openURL(checkout.checkoutUrl!)}><Text style={styles.primaryText}>Continue to Whop ↗</Text></Pressable> : <Pressable style={styles.primary} onPress={close}><Text style={styles.primaryText}>Done</Text></Pressable>}</View> : <ScrollView keyboardShouldPersistTaps="handled"><Text style={styles.muted}>A little accountability goes a long way. Stake $10 and invite your people.</Text><Text style={styles.fieldLabel}>POT NAME</Text><TextInput value={title} onChangeText={setTitle} placeholder="e.g. Morning run club" placeholderTextColor="#69717D" style={styles.input} /><Text style={styles.fieldLabel}>DAILY HABIT</Text><TextInput value={habit} onChangeText={setHabit} placeholder="What will you prove each day?" placeholderTextColor="#69717D" style={styles.input} /><View style={styles.stakeRow}><Text style={styles.optionText}>Weekly stake</Text><Text style={styles.optionAccent}>$10.00</Text></View>{error ? <Text style={styles.error}>{error}</Text> : null}<Pressable disabled={busy} style={styles.primary} onPress={() => void start()}><Text style={styles.primaryText}>{busy ? "Preparing checkout…" : "Continue to Whop →"}</Text></Pressable></ScrollView>}
  </View></View></Modal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#090B10" }, shell: { flex: 1, width: "100%", maxWidth: 600, alignSelf: "center", backgroundColor: "#090B10" }, header: { zIndex: 5, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14, backgroundColor: "#090B10" }, brandRow: { flexDirection: "row", alignItems: "center", gap: 8 }, logo: { width: 31, height: 31, borderRadius: 10, backgroundColor: lime, alignItems: "center", justifyContent: "center" }, logoText: { fontSize: 20, fontWeight: "900", color: "#090B10", fontStyle: "italic" }, brand: { color: "#fff", fontSize: 23, fontWeight: "900", letterSpacing: -1 }, potSelect: { marginLeft: "auto", maxWidth: "56%", backgroundColor: "#1A1D25", paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12 }, potSelectText: { color: "#E5E8E9", fontSize: 11, fontWeight: "700" }, contextRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 }, player: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#20242C", borderRadius: 30, padding: 4, paddingRight: 8 }, avatar: { width: 23, height: 23, borderRadius: 12, backgroundColor: "#B7A4F1", alignItems: "center", justifyContent: "center" }, avatarText: { color: "#161321", fontWeight: "900", fontSize: 11 }, playerText: { color: "white", fontSize: 11, fontWeight: "700" }, wallet: { backgroundColor: "#20242C", borderRadius: 30, paddingHorizontal: 9, paddingVertical: 9 }, walletText: { color: "#A9AFB8", fontSize: 10, fontWeight: "700" }, walletValue: { color: "#FFF" }, demo: { marginLeft: "auto", borderWidth: 1, borderColor: "#FA4616", borderRadius: 30, paddingHorizontal: 8, paddingVertical: 8 }, demoText: { color: "#FF7755", fontSize: 9, fontWeight: "900", letterSpacing: 0.4 }, dropdown: { position: "absolute", top: 105, right: 18, left: 18, backgroundColor: "#232831", borderRadius: 15, borderWidth: 1, borderColor: "#3B414A", padding: 5, zIndex: 20 }, option: { padding: 12 }, optionText: { color: "#FFF", fontWeight: "700" }, optionAccent: { color: lime, fontWeight: "800" }, loading: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 }, muted: { color: "#9BA3AD", fontSize: 13, lineHeight: 20 }, content: { flex: 1 }, tabs: { height: 65, flexDirection: "row", borderTopWidth: 1, borderColor: "#252931", backgroundColor: "#101319" }, tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 }, tabIcon: { color: "#737C87", fontSize: 21, fontWeight: "700" }, tabLabel: { color: "#737C87", fontSize: 10, fontWeight: "800" }, selected: { color: lime }, modalBackdrop: { flex: 1, backgroundColor: "#000B", justifyContent: "flex-end" }, sheet: { maxHeight: "90%", backgroundColor: "#171A22", borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 22, paddingBottom: 35 }, sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }, sheetTitle: { color: "#FFF", fontSize: 23, fontWeight: "900" }, close: { color: "#A3A9B3", fontSize: 20 }, fieldLabel: { color: "#9BA3AD", fontSize: 10, fontWeight: "900", letterSpacing: 1, marginTop: 22, marginBottom: 8 }, input: { color: "#FFF", backgroundColor: "#242832", borderRadius: 12, padding: 14, fontSize: 15 }, stakeRow: { flexDirection: "row", justifyContent: "space-between", marginVertical: 24 }, primary: { backgroundColor: lime, padding: 16, borderRadius: 14, alignItems: "center", marginTop: 16 }, primaryText: { color: "#10130B", fontWeight: "900", fontSize: 14 }, checkout: { alignItems: "center", gap: 12 }, checkoutBadge: { color: "#FF6A43", fontWeight: "900", fontSize: 11, letterSpacing: 1 }, checkoutTitle: { color: "white", fontWeight: "800", fontSize: 17 }, price: { color: "white", fontSize: 45, fontWeight: "900" }, error: { color: "#FF6079", marginTop: 10 },
});
