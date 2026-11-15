import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import DemoDrawer from "../src/components/DemoDrawer";
import GroupFlows from "../src/components/GroupFlows";
import LiveCamera from "../src/components/LiveCamera";
import PremiumPaywall from "../src/components/PremiumPaywall";
import QuestWalk from "../src/components/QuestWalk";
import WhopChat from "../src/components/WhopChat";
import { C, money } from "../src/standings/theme";
import { AppText as Text, fonts } from "../src/ui/fonts";

if (Platform.OS !== "web") Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });

export default function HomeScreen() {
  const pots = useQuery(api.pots.listActivePots, {});
  const seed = useMutation(api.demo.seedSidequestDemoPot);
  const triggerWarning = useAction(api.sidequests.triggerSidequestWarning);
  const startNow = useMutation(api.sidequests.startSidequestNow);
  const [potId, setPotId] = useState<Id<"pots"> | null>(null);
  const [userId, setUserId] = useState<Id<"users"> | null>(null);
  const dashboard = useQuery(api.pots.getPotDashboard, potId ? { potId } : "skip");
  const premium = useQuery(api.premium.getStatus, userId ? { userId } : "skip");
  const quest = useQuery(api.sidequests.getActiveSidequestForUser, potId && userId && dashboard?.pot.challengeMode === "sidequest" ? { potId, userId } : "skip");
  const availability = useQuery(api.availability.getUserAvailability, potId && userId && dashboard?.pot.challengeMode === "sidequest" ? { potId, userId } : "skip");
  const [tab, setTab] = useState<"table" | "groups" | "feed" | "camera">("table");
  const [selector, setSelector] = useState<"pot" | "player" | null>(null);
  const [demo, setDemo] = useState(false);
  const [showQuest, setShowQuest] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const nextWindow = useQuery(api.sidequests.getNextAvailabilityDispatch, potId && userId && dashboard?.pot.challengeMode === "sidequest" ? { potId, userId, now: Math.floor(now / 60000) * 60000 } : "skip");
  const seeded = useRef(false);
  const notified = useRef(new Set<string>());

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!quest || quest.status !== "warning_5m" || notified.current.has(quest._id) || Platform.OS === "web") return;
    notified.current.add(quest._id);
    void (async () => {
      try {
        const permission = await Notifications.requestPermissionsAsync();
        if (!permission.granted) { setActionError("Notifications are disabled; the warning remains visible here."); return; }
        await Notifications.scheduleNotificationAsync({ content: { title: "Ante sidequest warning", body: quest.title }, trigger: null });
      } catch { setActionError("Could not show a local notification; the warning remains visible here."); }
    })();
  }, [quest]);

  useEffect(() => {
    if (!pots || potId) return;
    const selected = pots.find(p => p.status === "active" && p.whopProductId === "demo_whop_product_sidequest") ?? pots.find(p => p.status === "active" && p.challengeMode === "sidequest");
    if (selected) { setPotId(selected._id); setUserId(selected.createdByUserId); return; }
    if (!seeded.current) {
      seeded.current = true;
      void seed({}).then(result => { setUserId(result.userId); setPotId(result.potId); }).catch(e => setError(e instanceof Error ? e.message : String(e)));
    }
  }, [pots, potId, seed]);
  useEffect(() => {
    if (dashboard && !dashboard.leaderboard.some(member => member.userId === userId)) setUserId(dashboard.leaderboard[0]?.userId ?? null);
  }, [dashboard, userId]);
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (showQuest) { setShowQuest(false); return true; }
      if (selector) { setSelector(null); return true; }
      if (tab !== "table") { setTab("table"); return true; }
      return false;
    });
    return () => sub.remove();
  }, [selector, showQuest, tab]);
  const selectPot = (id: Id<"pots">) => { setPotId(id); setSelector(null); setShowQuest(false); setTab("table"); };
  const member = dashboard?.leaderboard.find(m => m.userId === userId);
  const warningCountdown = quest ? Math.max(0, Math.ceil((quest.startsAt - now) / 1000)) : 0;
  const activeCountdown = quest ? Math.max(0, Math.ceil((quest.expiresAt - now) / 1000)) : 0;
  async function requestWarning() {
    if (!potId || !userId || busy) return;
    setBusy(true); setActionError("");
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let location: Location.LocationObject;
      try { location = await Promise.race([(async () => { const permission = await Location.requestForegroundPermissionsAsync(); if (!permission.granted) throw new Error("Location permission is required to find a nearby landmark."); return await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); })(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Location timed out. Please try again.")), 5000); })]); }
      finally { if (timer) clearTimeout(timer); }
      await triggerWarning({ potId, userId, lat: location.coords.latitude, lng: location.coords.longitude });
    } catch (e) { setActionError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  async function startQuest() {
    if (!quest || busy) return;
    setBusy(true); setActionError("");
    try { const started = await startNow({ sidequestId: quest._id }); if (!started) throw new Error("The sidequest could not be started."); setShowQuest(true); }
    catch (e) { setActionError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  return <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
    <View style={s.header}>
      <View style={s.brandRow}><View style={s.logo}><Text style={s.logoText}>A</Text></View><Text style={s.brand}>ante.</Text><Pressable onPress={() => setDemo(true)} style={s.stage}><Text style={s.stageText}>STAGE DEMO</Text></Pressable></View>
      <View style={s.switchRow}><Pressable style={s.switch} onPress={() => setSelector(selector === "pot" ? null : "pot")}><Text style={s.switchText} numberOfLines={1}>{dashboard?.pot.title ?? "Select a group"}  ⌄</Text></Pressable><Pressable style={s.switch} onPress={() => setSelector(selector === "player" ? null : "player")}><Text style={s.switchText}>{member?.user?.name ?? "Player"}  ⌄</Text></Pressable></View>
      {selector && <View style={s.dropdown}>{selector === "pot" ? pots?.map(p => <Pressable key={p._id} style={s.option} onPress={() => selectPot(p._id)}><Text style={s.optionText}>{p.title}</Text></Pressable>) : dashboard?.leaderboard.map(m => <Pressable key={m._id} style={s.option} onPress={() => { setUserId(m.userId); setSelector(null); setShowQuest(false); }}><Text style={s.optionText}>{m.user?.name ?? "Player"}{m.userId === userId ? "  ✓" : ""}</Text></Pressable>)}</View>}
    </View>
    {!potId || dashboard === undefined ? <View style={s.center}><ActivityIndicator color={C.accent} /><Text style={s.muted}>{error || "Opening your league…"}</Text>{error ? <Pressable onPress={() => void seed({}).then(r => { setUserId(r.userId); setPotId(r.potId); setError(""); }).catch(e => setError(String(e)))}><Text style={s.link}>Retry demo setup</Text></Pressable> : null}</View> : !dashboard ? <View style={s.center}><Text style={s.muted}>This group is unavailable.</Text></View> : !userId || premium === undefined ? <View style={s.center}><Text style={s.muted}>{dashboard.leaderboard.length ? "Loading player…" : "No players in this group yet."}</Text></View> : !premium.isPremium && !["demo_whop_product_gym_pact", "demo_whop_product_sidequest"].includes(dashboard.pot.whopProductId ?? "") ? <PremiumPaywall key={userId} userId={userId} /> : <>
      <View style={s.content}>
        {tab === "groups" ? <GroupFlows potId={potId} userId={userId} onPotChange={selectPot} /> : tab === "feed" ? <WhopChat potId={potId} /> : tab === "camera" ? <LiveCamera key={`${potId}:${userId}`} potId={potId} userId={userId} allowSimulatedDemo={dashboard.pot.whopProductId === "demo_whop_product_gym_pact"} onClose={() => setTab("table")} /> : <ScrollView contentContainerStyle={s.body}>
          <Text style={s.eyebrow}>ANTE LEAGUE · MATCHDAY {dashboard.pot.currentDayIndex}{dashboard.pot.whopProductId?.startsWith("demo_whop_product_") ? " · DEMO" : ""}</Text><Text style={s.title}>{dashboard.pot.title.toUpperCase()}</Text>
          <View style={s.prize}><View style={s.stripe} /><View><Text style={s.prizeLabel}>PRIZE POOL</Text><Text style={s.prizeValue}>{money(dashboard.pot.potTotalCents)}</Text></View><View style={s.prizeRight}><Text style={s.label}>SPLIT AT FULL TIME</Text><Text style={s.small}>{money(dashboard.pot.stakeCents)} buy-in</Text><Text style={s.small}>{money(dashboard.pot.forfeitedCents)} forfeited</Text></View></View>
          {dashboard.pot.inviteCode && <View style={s.invite}><View style={{ flex: 1 }}><Text style={s.label}>INVITE CODE · {dashboard.pot.inviteCode}</Text><Text selectable style={s.small}>https://ante.app/join/{dashboard.pot.inviteCode}</Text>{copyMessage ? <Text style={s.small}>{copyMessage}</Text> : null}</View><Pressable style={s.copy} onPress={() => void Clipboard.setStringAsync(`https://ante.app/join/${dashboard.pot.inviteCode}`).then(copied => setCopyMessage(copied ? "Invite link copied." : "Could not copy the invite link.")).catch(() => setCopyMessage("Could not copy the invite link."))}><Text style={s.ctaText}>COPY</Text></Pressable></View>}
          {dashboard.latestSettlement ? <View style={s.statusCard}><View style={s.ctas}><Ionicons name="trophy" size={22} color={C.green} /><Text style={s.eyebrow}>FULL TIME</Text></View><Text style={s.statusTitle}>{money(dashboard.latestSettlement.totalPotCents)} SETTLED</Text><Text style={s.small}>{dashboard.latestSettlement.summaryMessage}</Text>{dashboard.transferEvents.map(t => <View key={t.userId} style={s.transfer}><Text style={s.small}>{dashboard.leaderboard.find(m => m.userId === t.userId)?.user?.name ?? "Player"} · {money(t.amountCents)}</Text><View style={s.payoutTrack}><View style={[s.payoutBar, { width: `${Math.min(100, 100 * t.amountCents / Math.max(1, dashboard.pot.potTotalCents))}%` }]} /></View><Text style={s.small}>{t.status} / {t.mode}{t.whopTransferId ? ` · ${t.whopTransferId}` : ""}</Text></View>)}<Text style={s.small}>Simulated wallet (estimated before → current): {money((member?.user?.simulatedWalletBalanceCents ?? 0) - (member?.payoutCents ?? 0))} → {money(member?.user?.simulatedWalletBalanceCents ?? 0)}</Text></View> : dashboard.pot.challengeMode === "sidequest" ? <View style={[s.statusCard, quest?.status === "warning_5m" && s.warning]}><Text style={s.eyebrow}>{quest?.status === "warning_5m" ? "5 MINUTE WARNING" : quest?.status === "active" ? "SIDEQUEST LIVE" : quest?.status === "completed" ? "PROOF STANDS" : quest?.status.startsWith("failed") ? "OVERTURNED" : quest ? "SIDEQUEST STATUS" : "WAITING FOR KICKOFF"}</Text><Text style={s.statusTitle}>{quest ? quest.title.toUpperCase() : "YOUR NEXT SIDEQUEST"}</Text><Text style={s.small}>{quest ? `${quest.status.replace(/_/g, " ")} · ${quest.destSource === "curated_fallback" ? "Fallback waypoint" : `Landmark source: ${quest.destSource}`} · ${quest.distanceMeters}m · ${quest.allottedMinutes} min` : nextWindow === undefined || availability === undefined ? "Loading availability…" : nextWindow ? `Next available window: ${new Date(nextWindow.startsAt).toLocaleString(undefined, { timeZone: availability?.timezone })} (${availability?.timezone}). This is not a scheduled dispatch.` : "No upcoming availability window set."}</Text>{quest?.status === "warning_5m" && <Text style={s.statusTitle}>STARTS IN {Math.floor(warningCountdown / 60)}:{String(warningCountdown % 60).padStart(2, "0")}</Text>}{quest?.status === "active" && <Text style={s.statusTitle}>TIME LEFT {Math.floor(activeCountdown / 60)}:{String(activeCountdown % 60).padStart(2, "0")}</Text>}{actionError ? <Text accessibilityRole="alert" style={s.error}>{actionError}</Text> : null}<View style={s.ctas}>{quest ? <><Pressable onPress={() => setShowQuest(true)} style={s.cta}><Text style={s.ctaText}>VIEW SIDEQUEST →</Text></Pressable>{quest.status === "warning_5m" && <Pressable disabled={busy} onPress={() => void startQuest()} style={s.cta}><Text style={s.ctaText}>{busy ? "STARTING…" : "START NOW"}</Text></Pressable>}</> : <><Pressable onPress={() => setTab("groups")} style={s.cta}><Text style={s.ctaText}>SET AVAILABILITY</Text></Pressable><Pressable disabled={busy || member?.stakeStatus !== "funded" || dashboard.pot.status !== "active"} onPress={() => void requestWarning()} style={s.cta}><Text style={s.ctaText}>{busy ? "FINDING…" : "TRIGGER WARNING"}</Text></Pressable></>}</View></View> : <Pressable onPress={() => setTab("camera")} disabled={dashboard.pot.status !== "active" || member?.stakeStatus !== "funded" || member.completedDays.includes(dashboard.pot.currentDayIndex)} style={s.action}><Text style={s.actionText}>{member?.completedDays.includes(dashboard.pot.currentDayIndex) ? "DONE FOR TODAY ✓" : member?.stakeStatus !== "funded" ? "STAKE NOT ACTIVE" : "SUBMIT TODAY'S PROOF  →"}</Text></Pressable>}
          <View style={s.table}><View style={s.tableHead}><Text style={[s.th, { width: 28 }]}>#</Text><Text style={[s.th, { flex: 1 }]}>PLAYER</Text><Text style={[s.th, s.statCol]}>P</Text><Text style={[s.th, s.statCol]}>W</Text><Text style={[s.th, { width: 49, textAlign: "right" }]}>STREAK</Text><Text style={[s.th, { width: 76, textAlign: "right" }]}>{dashboard.latestSettlement ? "PAYOUT" : "PROJ. PAY"}</Text></View>{(() => {
            const rows = [...dashboard.leaderboard].sort((a, b) => Number(a.stakeStatus === "forfeited" || a.missedDays.length > 0) - Number(b.stakeStatus === "forfeited" || b.missedDays.length > 0) || b.completedDays.length - a.completedDays.length);
            const firstOut = rows.findIndex(m => m.stakeStatus === "forfeited" || m.missedDays.length > 0);
            const eligible = rows.filter(m => m.stakeStatus === "funded" && m.missedDays.length === 0).sort((a, b) => a.joinedAt - b.joinedAt || a.userId.localeCompare(b.userId));
            return rows.map((m, i) => {
              const eligibleIndex = eligible.findIndex(e => e.userId === m.userId);
              const projected = eligibleIndex < 0 ? null : Math.floor(dashboard.pot.potTotalCents / eligible.length) + (eligibleIndex < dashboard.pot.potTotalCents % eligible.length ? 1 : 0);
              return <View key={m._id}>{i === firstOut && <View style={s.drop}><View style={s.dash} /><Text style={s.dropText}>DROP ZONE</Text><View style={s.dash} /></View>}<View style={[s.tableRow, i >= firstOut && firstOut >= 0 && s.outRow]}><Text style={s.position}>{i + 1}</Text><View style={{ flex: 1 }}><Text numberOfLines={1} style={s.player}>{(m.user?.name ?? "Player").toUpperCase()}</Text>{m.userId === userId && <Text style={s.you}>YOU</Text>}{m.stakeStatus === "pending_checkout" && <Text style={s.you}>PAYMENT PENDING</Text>}</View><Text style={s.stat}>{new Set([...m.completedDays, ...m.missedDays]).size}</Text><Text style={s.stat}>{m.completedDays.length}</Text><Text style={s.streak}>{m.streakCount}</Text><Text style={s.payout}>{m.payoutCents !== undefined ? money(m.payoutCents) : m.stakeStatus === "forfeited" || m.missedDays.length ? "OUT" : projected === null ? "—" : money(projected)}</Text></View></View>;
            });
          })()}</View>
          <Text style={s.legend}>P = DAYS RECORDED · W = COMPLETED · PROJECTIONS ASSUME CURRENT ELIGIBILITY</Text><Text style={s.footer}>Ante powered by Whop</Text>
        </ScrollView>}
      </View>
      {tab !== "camera" && <View style={s.tabs}>{([['table', 'STANDINGS'], ['groups', 'GROUPS'], ['feed', 'MATCH FEED']] as const).map(([id, label]) => <Pressable key={id} onPress={() => setTab(id)} style={s.tab}><Text style={[s.tabText, tab === id && s.tabActive]}>{label}</Text></Pressable>)}</View>}
    </>}
    {potId && <DemoDrawer potId={potId} userId={userId} visible={demo} onClose={() => setDemo(false)} onReset={(id, primaryUser) => { selectPot(id); if (primaryUser) setUserId(primaryUser); }} />}
    {potId && userId && quest && showQuest && <Modal visible animationType="slide" onRequestClose={() => setShowQuest(false)}><QuestWalk potId={potId} userId={userId} sidequestId={quest._id} onClose={() => setShowQuest(false)} /></Modal>}
  </SafeAreaView>;
}

const s = StyleSheet.create({
  payoutTrack: { height: 4, backgroundColor: C.hair, overflow: "hidden" }, payoutBar: { height: 4, backgroundColor: C.green },
  invite: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 8, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }, copy: { backgroundColor: C.ink, borderRadius: 5, paddingHorizontal: 12, paddingVertical: 10 }, statCol: { width: 29, textAlign: "right" }, stat: { width: 29, textAlign: "right", color: C.ink, fontFamily: fonts.condensed, fontSize: 16, fontVariant: ["tabular-nums"] }, streak: { width: 49, textAlign: "right", color: C.ink, fontFamily: fonts.condensed, fontSize: 16, fontVariant: ["tabular-nums"] },
  ctas: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 5 }, cta: { backgroundColor: C.ink, borderRadius: 5, paddingVertical: 10, paddingHorizontal: 12 }, ctaText: { color: C.white, fontFamily: fonts.condensed, fontSize: 12, letterSpacing: 0.5 }, error: { color: C.accent, fontFamily: fonts.sans, fontSize: 12 },
  safe: { flex: 1, backgroundColor: C.bg }, header: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12, backgroundColor: C.bg, zIndex: 2 }, brandRow: { flexDirection: "row", alignItems: "center", gap: 8 }, logo: { width: 28, height: 28, backgroundColor: C.accent, alignItems: "center", justifyContent: "center", borderRadius: 5 }, logoText: { color: C.white, fontFamily: fonts.condensedHeavy, fontSize: 20 }, brand: { fontFamily: fonts.condensedHeavy, color: C.ink, fontSize: 27, flex: 1 }, stage: { borderColor: C.accent, borderWidth: 1, borderRadius: 5, paddingHorizontal: 9, paddingVertical: 6 }, stageText: { color: C.accent, fontFamily: fonts.condensed, fontSize: 11, letterSpacing: 1 }, switchRow: { flexDirection: "row", gap: 8, marginTop: 10 }, switch: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, flex: 1 }, switchText: { color: C.ink, fontFamily: fonts.sansSemi, fontSize: 11 }, dropdown: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 6, marginTop: 4, elevation: 4 }, option: { padding: 11 }, optionText: { color: C.ink, fontFamily: fonts.sansMedium, fontSize: 13 }, center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 }, muted: { color: C.muted, fontFamily: fonts.sans, textAlign: "center" }, link: { color: C.accent, fontFamily: fonts.sansBold }, content: { flex: 1 }, body: { padding: 18, paddingBottom: 28, gap: 14 }, eyebrow: { color: C.accent, fontFamily: fonts.condensed, fontSize: 12, letterSpacing: 1.5 }, title: { color: C.ink, fontFamily: fonts.condensedHeavy, fontSize: 32, lineHeight: 34 }, prize: { backgroundColor: C.card, flexDirection: "row", alignItems: "center", borderRadius: 8, overflow: "hidden", minHeight: 100, elevation: 1 }, stripe: { width: 5, backgroundColor: C.accent, alignSelf: "stretch", marginRight: 16 }, prizeLabel: { color: C.accent, fontFamily: fonts.condensed, letterSpacing: 1.5 }, prizeValue: { color: C.ink, fontFamily: fonts.condensedHeavy, fontSize: 40, fontVariant: ["tabular-nums"] }, prizeRight: { flex: 1, alignItems: "flex-end", paddingRight: 16, gap: 6 }, label: { color: C.ink, fontFamily: fonts.condensed, fontSize: 12, letterSpacing: 1 }, small: { color: C.ink2, fontFamily: fonts.sans, fontSize: 12, lineHeight: 18 }, statusCard: { backgroundColor: C.card, padding: 16, borderRadius: 8, gap: 6, borderWidth: 1, borderColor: C.line }, warning: { backgroundColor: C.accentSoft, borderColor: C.accent }, statusTitle: { color: C.ink, fontFamily: fonts.condensedHeavy, fontSize: 22 }, transfer: { borderTopWidth: 1, borderColor: C.line, paddingTop: 8 }, action: { backgroundColor: C.ink, borderRadius: 7, padding: 18 }, actionText: { color: C.white, fontFamily: fonts.condensedHeavy, fontSize: 18, letterSpacing: 0.6 }, table: { backgroundColor: C.card, borderRadius: 8, overflow: "hidden", elevation: 1 }, tableHead: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 13, backgroundColor: C.ink }, th: { color: C.white, fontFamily: fonts.condensed, fontSize: 10, letterSpacing: 0.6 }, tableRow: { flexDirection: "row", alignItems: "center", minHeight: 56, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: C.hair }, outRow: { backgroundColor: C.accentTint }, position: { width: 28, color: C.ink, fontFamily: fonts.condensedHeavy, fontSize: 18 }, player: { color: C.ink, fontFamily: fonts.condensed, fontSize: 15 }, you: { color: C.accent, fontFamily: fonts.condensed, fontSize: 9 }, payout: { width: 76, textAlign: "right", color: C.ink, fontFamily: fonts.condensed, fontSize: 16 }, drop: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 5 }, dash: { flex: 1, borderTopWidth: 1, borderStyle: "dashed", borderColor: C.accent }, dropText: { color: C.accent, fontFamily: fonts.condensed, fontSize: 10, letterSpacing: 1 }, legend: { color: C.muted, fontFamily: fonts.condensed, fontSize: 10, letterSpacing: 0.5 }, footer: { color: C.muted, textAlign: "center", fontFamily: fonts.sans, fontSize: 11, marginTop: 10 }, tabs: { flexDirection: "row", backgroundColor: C.card, borderTopWidth: 1, borderColor: C.line }, tab: { flex: 1, alignItems: "center", paddingVertical: 15 }, tabText: { color: C.muted, fontFamily: fonts.condensed, fontSize: 12, letterSpacing: 0.7 }, tabActive: { color: C.accent },
});
