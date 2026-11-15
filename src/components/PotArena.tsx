import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { PersonaId } from "../../convex/lib/contracts";

type Props = {
  potId: Id<"pots">;
  userId: Id<"users">;
  onCamera: () => void;
  onCreate: () => void;
  onDemo: () => void;
};

const personas: { id: PersonaId; label: string; short: string }[] = [
  { id: "drill_sergeant", label: "Drill Sergeant", short: "DRILL" },
  { id: "passive_aggressive_roommate", label: "Passive-Aggressive Roommate", short: "ROOMMATE" },
  { id: "wall_street_bro", label: "Wall Street Bro", short: "WALL ST" },
  { id: "disappointed_coach", label: "Disappointed Coach", short: "COACH" },
];

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function countdown(deadline: number, now: number) {
  const seconds = Math.max(0, Math.floor((deadline - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map(value => String(value).padStart(2, "0")).join(":");
}

export default function PotArena({ potId, userId, onCamera, onCreate, onDemo }: Props) {
  const dashboard = useQuery(api.pots.getPotDashboard, { potId });
  const setPotPersona = useMutation(api.pots.setPotPersona);
  const [now, setNow] = useState(Date.now());
  const [savingPersona, setSavingPersona] = useState(false);
  const [personaError, setPersonaError] = useState("");

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const changePersona = async (roastPersona: PersonaId) => {
    if (savingPersona || dashboard?.pot.roastPersona === roastPersona) return;
    setSavingPersona(true);
    setPersonaError("");
    try {
      await setPotPersona({ potId, roastPersona });
    } catch {
      setPersonaError("Couldn't update the referee. Try again.");
    } finally {
      setSavingPersona(false);
    }
  };

  if (dashboard === undefined) {
    return <View style={styles.center}><ActivityIndicator color="#c6f65b" /><Text style={styles.loadingText}>Loading your arena...</Text></View>;
  }

  if (dashboard === null) {
    return <View style={styles.center}><Text style={styles.emptyTitle}>Pot not found</Text><Text style={styles.loadingText}>This arena may no longer be available.</Text><Pressable onPress={onCreate} style={styles.emptyButton}><Text style={styles.primaryText}>Create a pot</Text></Pressable></View>;
  }

  const { pot, leaderboard, latestSettlement, transferEvents, recentSubmissions } = dashboard;
  const member = leaderboard.find(player => player.userId === userId);
  const todaySubmissions = recentSubmissions.filter(submission => submission.userId === userId && submission.dayIndex === pot.currentDayIndex);
  const hasPassed = member?.completedDays.includes(pot.currentDayIndex) || todaySubmissions.some(submission => submission.verdict === "passed");
  const isPending = todaySubmissions.some(submission => submission.verdict === "pending");
  const deadlinePassed = now >= pot.nextDeadlineAt;
  const canSubmit = pot.status === "active" && member?.stakeStatus === "funded" && !deadlinePassed && !hasPassed && !isPending;
  const actionLabel = pot.status === "settled" ? "Pot settled" : pot.status === "settling" ? "Settlement in progress" : pot.status !== "active" ? "Waiting for the pot to start" : !member || member.stakeStatus === "pending_checkout" ? "Fund your stake to check in" : member.stakeStatus !== "funded" ? "Stake forfeited" : hasPassed ? "Today's proof is in" : isPending ? "Proof under review" : deadlinePassed ? "Today's deadline has passed" : "Submit today's proof";
  const fundedCount = leaderboard.filter(player => player.stakeStatus !== "pending_checkout").length;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topbar}>
          <View><Text style={styles.brand}>The arena<Text style={styles.brandDot}>.</Text></Text><Text style={styles.topSub}>YOUR HABIT, YOUR STAKE</Text></View>
          <View style={styles.topActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Open demo controls" onPress={onDemo} style={styles.demoButton}><Ionicons name="options-outline" size={17} color="#e7e9e2" /><Text style={styles.demoText}>DEMO</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Create a pot" onPress={onCreate} style={styles.plusButton}><Ionicons name="add" size={24} color="#11150d" /></Pressable>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroTop}><View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>{pot.status === "active" ? "LIVE POT" : pot.status.toUpperCase()}</Text></View><Text style={styles.dayLabel}>DAY {Math.min(pot.currentDayIndex, 7)} / 7</Text></View>
          <Text style={styles.heroEyebrow}>SHOW UP. CASH IN.</Text>
          <Text style={styles.heroTitle}>{pot.title}</Text>
          <Text style={styles.heroPrompt}>{pot.habitPrompt}</Text>
          <View style={styles.heroDivider} />
          <View style={styles.heroStats}>
            <View><Text style={styles.statLabel}>THE POT</Text><Text style={styles.potAmount}>{money(pot.potTotalCents)}</Text></View>
            <View style={styles.statRight}><Text style={styles.statLabel}>BUY-IN</Text><Text style={styles.statValue}>{money(pot.stakeCents)} <Text style={styles.statMuted}>/ person</Text></Text><Text style={styles.memberCount}>{fundedCount} {fundedCount === 1 ? "player" : "players"} funded</Text></View>
          </View>
          <Text style={styles.forfeitedPool}>{money(pot.forfeitedCents)} forfeited pool</Text>
        </View>

        <View style={styles.deadlineCard}>
          <View style={styles.deadlineIcon}><Ionicons name="time-outline" size={22} color="#c6f65b" /></View>
          <View style={styles.deadlineCopy}><Text style={styles.smallLabel}>{pot.status === "active" ? "TODAY'S DEADLINE" : "POT STATUS"}</Text><Text style={styles.deadlineHint}>{pot.status === "active" ? (deadlinePassed ? "Cutoff reached" : "Get your proof in before time runs out") : pot.status === "settled" ? "The final results are in" : pot.status === "settling" ? "Calculating the final results" : "Waiting for players to fund"}</Text></View>
          {pot.status === "active" && <Text style={styles.clock}>{countdown(pot.nextDeadlineAt, now)}</Text>}
        </View>

        <View style={styles.sectionHeading}><View><Text style={styles.eyebrow}>THE REFEREE</Text><Text style={styles.sectionTitle}>Pick your motivator</Text></View><Ionicons name="sparkles-outline" size={20} color="#c6f65b" /></View>
        <Text style={styles.sectionDescription}>Choose who delivers the verdict for everyone in this pot.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.personaList}>
          {personas.map(persona => {
            const selected = pot.roastPersona === persona.id;
            return <Pressable key={persona.id} accessibilityRole="button" accessibilityLabel={persona.label} accessibilityState={{ selected, disabled: savingPersona }} disabled={savingPersona} onPress={() => void changePersona(persona.id)} style={[styles.persona, selected && styles.personaSelected]}><Text style={[styles.personaShort, selected && styles.personaShortSelected]}>{persona.short}</Text><Text style={[styles.personaName, selected && styles.personaNameSelected]}>{persona.label}</Text>{selected && <Ionicons name="checkmark-circle" size={18} color="#c6f65b" style={styles.personaCheck} />}</Pressable>;
          })}
        </ScrollView>
        {!!personaError && <Text accessibilityRole="alert" style={styles.error}>{personaError}</Text>}

        <View style={styles.sectionHeading}><View><Text style={styles.eyebrow}>SEVEN DAYS. NO EXCUSES.</Text><Text style={styles.sectionTitle}>The leaderboard</Text></View><Text style={styles.countPill}>{leaderboard.length} IN</Text></View>
        <View style={styles.board}>
          <View style={styles.boardHeader}><Text style={styles.boardHeaderPlayer}>PLAYER</Text><View style={styles.grid}>{Array.from({ length: 7 }, (_, index) => <Text key={index} style={styles.gridHeader}>{index + 1}</Text>)}</View></View>
          {leaderboard.length === 0 ? <Text style={styles.boardEmpty}>No players yet. Get the crew together.</Text> : leaderboard.map((player, index) => <View key={player._id} style={styles.playerRow}>
            <Text style={styles.rank}>{String(index + 1).padStart(2, "0")}</Text>
            <View style={[styles.avatar, player.userId === userId && styles.avatarYou]}><Text style={styles.avatarText}>{(player.user?.name || "?").charAt(0).toUpperCase()}</Text></View>
            <View style={styles.playerInfo}><Text style={styles.playerName} numberOfLines={1}>{player.user?.name ?? "Unknown player"}{player.userId === userId ? " (you)" : ""}</Text><Text style={styles.playerMeta} numberOfLines={1}>{player.stakeStatus === "pending_checkout" ? "Awaiting payment" : player.stakeStatus === "forfeited" ? `Forfeited ${money(pot.stakeCents)}` : player.stakeStatus === "won" ? `Won ${money(player.payoutCents ?? 0)}` : `Whop funded · ${player.streakCount} day streak`}</Text></View>
            <View style={styles.grid}>{player.streakGrid.map((state, day) => <View key={day} accessibilityLabel={`Day ${day + 1}: ${state}`} style={[styles.day, state === "completed" && styles.dayComplete, state === "missed" && styles.dayMissed, day + 1 === pot.currentDayIndex && state === "pending" && styles.dayCurrent]}>{state === "completed" ? <Ionicons name="checkmark" size={12} color="#151a0d" /> : state === "missed" ? <Ionicons name="close" size={12} color="#ff827b" /> : null}</View>)}</View>
          </View>)}
          <View style={styles.legend}><View style={styles.legendItem}><View style={[styles.legendDot, styles.dayComplete]} /><Text style={styles.legendText}>Done</Text></View><View style={styles.legendItem}><View style={[styles.legendDot, styles.dayMissed]} /><Text style={styles.legendText}>Missed</Text></View><View style={styles.legendItem}><View style={[styles.legendDot, styles.dayCurrent]} /><Text style={styles.legendText}>Up next</Text></View></View>
        </View>

        {latestSettlement && <>
          <View style={styles.sectionHeading}><View><Text style={styles.eyebrow}>THE FINAL TALLY</Text><Text style={styles.sectionTitle}>Settlement receipts</Text></View><Ionicons name="receipt-outline" size={21} color="#c6f65b" /></View>
          <View style={styles.receipt}><Text style={styles.receiptSummary}>{money(latestSettlement.totalPotCents)} settled · {latestSettlement.winnerUserIds.length} {latestSettlement.winnerUserIds.length === 1 ? "winner" : "winners"}</Text><Text style={styles.receiptSub}>{money(latestSettlement.forfeitedPoolCents)} forfeited pool · {latestSettlement.triggeredBy === "demo" ? "Demo settlement" : "Scheduled settlement"}</Text>{transferEvents.length === 0 ? <Text style={styles.receiptSub}>No transfers recorded.</Text> : transferEvents.map(transfer => {
            const recipient = leaderboard.find(player => player.userId === transfer.userId);
            return <View key={transfer.userId} style={styles.transfer}><View style={styles.transferCopy}><Text style={styles.transferName}>{recipient?.user?.name ?? "Player"}{transfer.userId === userId ? " (you)" : ""}</Text><Text style={styles.transferDetail}>{transfer.status === "pending" ? "Transfer pending" : transfer.status === "completed" ? "Transfer completed" : "Fallback transfer"} · {transfer.mode === "live" ? "Live" : "Fallback"}{transfer.whopTransferId ? `\nWhop transfer: ${transfer.whopTransferId}` : ""}</Text></View><Text style={styles.transferAmount}>{money(transfer.amountCents)}</Text></View>;
          })}{latestSettlement.loserUserIds.filter(id => !latestSettlement.winnerUserIds.includes(id)).map(id => <View key={id} style={styles.transfer}><Text style={styles.transferName}>{leaderboard.find(player => player.userId === id)?.user?.name ?? "Player"} · forfeited</Text><Text style={[styles.transferAmount, { marginLeft: "auto" }]}>{money(0)}</Text></View>)}{member?.user && <Text style={styles.wallet}>Your simulated wallet balance  {money(member.user.simulatedWalletBalanceCents)}</Text>}</View>
        </>}

        <View style={styles.footer}><Ionicons name="lock-closed-outline" size={13} color="#82887b" /><Text style={styles.footerText}> Stakes powered by Whop</Text></View>
      </ScrollView>
      <View style={styles.actionBar}><Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSubmit }} onPress={onCamera} disabled={!canSubmit} style={[styles.primaryButton, !canSubmit && styles.primaryDisabled]}><Ionicons name={canSubmit ? "camera-outline" : "checkmark-circle-outline"} size={21} color={canSubmit ? "#11150d" : "#a0a59a"} /><Text style={[styles.primaryText, !canSubmit && styles.disabledText]}>{actionLabel}</Text>{canSubmit && <Ionicons name="arrow-forward" size={20} color="#11150d" />}</Pressable>{hasPassed && pot.status === "active" && <Pressable accessibilityRole="button" onPress={onDemo} style={styles.nextDay}><Text style={styles.nextDayText}>Open demo controls to advance the day →</Text></Pressable>}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0c0f0b" },
  center: { flex: 1, backgroundColor: "#0c0f0b", alignItems: "center", justifyContent: "center", padding: 24 },
  loadingText: { color: "#9ba295", marginTop: 12, textAlign: "center" },
  emptyTitle: { color: "#f4f6ee", fontSize: 24, fontWeight: "800" },
  emptyButton: { backgroundColor: "#c6f65b", borderRadius: 14, paddingHorizontal: 22, paddingVertical: 14, marginTop: 20 },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28 },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 22 },
  brand: { color: "#f6f8f0", fontSize: 22, fontWeight: "900", letterSpacing: -1 },
  brandDot: { color: "#c6f65b" },
  topSub: { color: "#8d9586", fontSize: 9, fontWeight: "800", letterSpacing: 1.8, marginTop: 1 },
  topActions: { flexDirection: "row", gap: 9, alignItems: "center" },
  demoButton: { height: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: "#333a2f", flexDirection: "row", alignItems: "center", gap: 6 },
  demoText: { color: "#e7e9e2", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  plusButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#c6f65b", alignItems: "center", justifyContent: "center" },
  hero: { backgroundColor: "#1b2416", borderColor: "#344728", borderWidth: 1, borderRadius: 24, padding: 20, overflow: "hidden" },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  livePill: { backgroundColor: "#303f23", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#c6f65b" },
  liveText: { color: "#c6f65b", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  dayLabel: { color: "#b2c4a4", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  heroEyebrow: { color: "#b3d980", fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginBottom: 7 },
  heroTitle: { color: "#f8faef", fontSize: 30, lineHeight: 34, fontWeight: "900", letterSpacing: -1 },
  heroPrompt: { color: "#bbc5b2", fontSize: 14, lineHeight: 20, marginTop: 9 },
  heroDivider: { height: 1, backgroundColor: "#3a4932", marginVertical: 20 },
  heroStats: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  statLabel: { color: "#9aac8c", fontSize: 9, fontWeight: "800", letterSpacing: 1.4 },
  potAmount: { color: "#c6f65b", fontSize: 38, fontWeight: "900", letterSpacing: -1.5, marginTop: 2 },
  statRight: { alignItems: "flex-end", paddingBottom: 4 },
  statValue: { color: "#f4f6ed", fontSize: 17, fontWeight: "800", marginTop: 5 },
  statMuted: { color: "#a1af97", fontSize: 11, fontWeight: "500" },
  memberCount: { color: "#a1af97", fontSize: 11, marginTop: 4 },
  forfeitedPool: { color: "#ff9c91", fontSize: 11, fontWeight: "700", marginTop: 10 },
  deadlineCard: { marginTop: 12, backgroundColor: "#181c16", borderColor: "#2a3126", borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", gap: 11 },
  deadlineIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#29351f", alignItems: "center", justifyContent: "center" },
  deadlineCopy: { flex: 1 },
  smallLabel: { color: "#c4cbbd", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  deadlineHint: { color: "#858e7f", fontSize: 11, lineHeight: 15, marginTop: 4 },
  clock: { color: "#f5f8ee", fontSize: 17, fontWeight: "800", fontVariant: ["tabular-nums"] },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 29, marginBottom: 8 },
  eyebrow: { color: "#9ca990", fontSize: 9, fontWeight: "900", letterSpacing: 1.5, marginBottom: 5 },
  sectionTitle: { color: "#f5f7ef", fontSize: 21, fontWeight: "800", letterSpacing: -0.5 },
  sectionDescription: { color: "#929a8c", fontSize: 12, lineHeight: 18, marginBottom: 13 },
  personaList: { gap: 8, paddingRight: 20 },
  persona: { width: 134, minHeight: 91, borderWidth: 1, borderColor: "#30372c", backgroundColor: "#181c16", borderRadius: 15, padding: 12 },
  personaSelected: { borderColor: "#a5d84d", backgroundColor: "#26331d" },
  personaShort: { color: "#9ca694", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  personaShortSelected: { color: "#c6f65b" },
  personaName: { color: "#e2e6dc", fontSize: 13, fontWeight: "700", lineHeight: 17, marginTop: 9, paddingRight: 10 },
  personaNameSelected: { color: "#f4f9e8" },
  personaCheck: { position: "absolute", top: 10, right: 10 },
  error: { color: "#ff9b92", fontSize: 12, marginTop: 8 },
  countPill: { color: "#c6f65b", backgroundColor: "#26321e", overflow: "hidden", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  board: { backgroundColor: "#181c16", borderColor: "#2a3126", borderWidth: 1, borderRadius: 18, marginTop: 6, paddingHorizontal: 12 },
  boardHeader: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderColor: "#30372c", paddingVertical: 12 },
  boardHeaderPlayer: { color: "#7e8978", fontSize: 9, fontWeight: "800", letterSpacing: 1, flex: 1 },
  grid: { flexDirection: "row", gap: 3 },
  gridHeader: { width: 19, color: "#7e8978", textAlign: "center", fontSize: 9, fontWeight: "700" },
  playerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 13, borderBottomWidth: 1, borderColor: "#282f25" },
  rank: { width: 24, color: "#8b9684", fontSize: 11, fontWeight: "800" },
  avatar: { width: 32, height: 32, borderRadius: 12, backgroundColor: "#414b3a", alignItems: "center", justifyContent: "center", marginRight: 8 },
  avatarYou: { backgroundColor: "#789c41" },
  avatarText: { color: "#f5f8ee", fontSize: 13, fontWeight: "800" },
  playerInfo: { flex: 1, minWidth: 0, paddingRight: 4 },
  playerName: { color: "#f2f5ec", fontSize: 12, fontWeight: "800" },
  playerMeta: { color: "#8d9787", fontSize: 10, marginTop: 3 },
  day: { width: 19, height: 22, borderRadius: 5, backgroundColor: "#30382c", alignItems: "center", justifyContent: "center" },
  dayComplete: { backgroundColor: "#c6f65b" },
  dayMissed: { backgroundColor: "#55302c" },
  dayCurrent: { borderWidth: 1, borderColor: "#a7d456" },
  boardEmpty: { color: "#a4ad9d", fontSize: 13, paddingVertical: 20 },
  legend: { flexDirection: "row", gap: 16, paddingVertical: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 3, backgroundColor: "#30382c" },
  legendText: { color: "#8d9787", fontSize: 10 },
  receipt: { backgroundColor: "#181c16", borderColor: "#2a3126", borderWidth: 1, borderRadius: 18, marginTop: 6, padding: 15 },
  receiptSummary: { color: "#f2f5ec", fontSize: 15, fontWeight: "800" },
  receiptSub: { color: "#9ca595", fontSize: 11, marginTop: 5, lineHeight: 16 },
  transfer: { flexDirection: "row", borderTopWidth: 1, borderColor: "#30372c", marginTop: 12, paddingTop: 12, gap: 8 },
  transferCopy: { flex: 1 },
  transferName: { color: "#f2f5ec", fontSize: 13, fontWeight: "700" },
  transferDetail: { color: "#9ca595", fontSize: 10, lineHeight: 15, marginTop: 4 },
  transferAmount: { color: "#c6f65b", fontSize: 16, fontWeight: "800" },
  wallet: { color: "#c6f65b", fontSize: 11, marginTop: 14, fontWeight: "700" },
  footer: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 24 },
  footerText: { color: "#82887b", fontSize: 11 },
  actionBar: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, borderTopWidth: 1, borderColor: "#262d23", backgroundColor: "#0c0f0b" },
  primaryButton: { backgroundColor: "#c6f65b", height: 54, borderRadius: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 },
  primaryText: { color: "#11150d", fontWeight: "900", fontSize: 15 },
  primaryDisabled: { backgroundColor: "#30372c" },
  disabledText: { color: "#a0a59a" },
  nextDay: { alignItems: "center", paddingTop: 10 },
  nextDayText: { color: "#b5c8a3", fontSize: 11, fontWeight: "700" },
});
