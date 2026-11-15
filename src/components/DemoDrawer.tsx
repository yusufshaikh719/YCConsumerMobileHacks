import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PERSONA_IDS, type PersonaId } from "../../convex/lib/contracts";
import { ROAST_PERSONAS } from "../../convex/personas";
import * as Location from "expo-location";
import { C } from "../standings/theme";
import { AppText as Text, fonts } from "../ui/fonts";

type Props = {
  potId: Id<"pots">;
  userId: Id<"users"> | null;
  visible: boolean;
  onClose: () => void;
  onReset: (potId: Id<"pots">, userId?: Id<"users">) => void;
};

export function DemoDrawer({ potId, userId, visible, onClose, onReset }: Props) {
  const dashboard = useQuery(api.pots.getPotDashboard, visible ? { potId } : "skip");
  const seed = useMutation(api.demo.seedStageDemoPot);
  const seedSidequest = useMutation(api.demo.seedSidequestDemoPot);
  const triggerWarning = useAction(api.sidequests.triggerSidequestWarning);
  const startNow = useMutation(api.sidequests.startSidequestNow);
  const simulateWalk = useMutation(api.demo.demoSimulateWalkTrace);
  const quest = useQuery(api.sidequests.getActiveSidequestForUser, visible && userId ? { potId, userId } : "skip");
  const forceVerdict = useMutation(api.demo.forceDemoSubmissionVerdict);
  const simulatePayment = useMutation(api.demo.simulateWhopPayment);
  const fastForward = useMutation(api.demo.fastForwardDailyDeadline);
  const settle = useMutation(api.demo.simulateSundaySettlement);
  const setPersona = useMutation(api.pots.setPotPersona);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [inspector, setInspector] = useState(false);
  const isDemo = dashboard?.pot.whopProductId === "demo_whop_product_gym_pact";
  const isSidequestDemo = dashboard?.pot.whopProductId === "demo_whop_product_sidequest";
  const active = (isDemo || isSidequestDemo) && dashboard?.pot.status === "active";
  const pending = dashboard?.recentSubmissions.find((submission) => submission.verdict === "pending" && submission.dayIndex === dashboard.pot.currentDayIndex);
  const paymentMember = dashboard?.leaderboard.find((member) => member.whopPaymentId);
  const events = dashboard?.webhookEvents.filter((event) => event.payloadSummary.includes(`pot=${potId} `)) ?? [];

  async function run(action: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      setMessage(await action());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Demo action failed.");
    } finally {
      setBusy(false);
    }
  }

  function button(label: string, action: () => void, disabled = false, selected = false) {
    return (
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, selected }} disabled={disabled || busy} onPress={action} style={[styles.button, selected && styles.selected, (disabled || busy) && styles.disabled]}>
        <Text style={styles.buttonText}>{label}</Text>
      </Pressable>
    );
  }

  function choosePersona(roastPersona: PersonaId) {
    void run(async () => {
      await setPersona({ potId, roastPersona });
      return `Persona set to ${ROAST_PERSONAS[roastPersona].name}.`;
    });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.drawer}>
          <View style={styles.header}>
            <Text style={styles.title}>Demo controls</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close demo controls" onPress={onClose}><Text style={styles.close}>Close</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.note}>Demo actions modify seeded pots. Wallet balances and payment replay are simulated.</Text>
            {dashboard === undefined ? <Text style={styles.note}>Loading pot…</Text> : !isDemo && !isSidequestDemo ? <Text style={styles.note}>Stage actions are available for seeded demo pots only.</Text> : null}
            {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}

            {button("Reset seeded demo", () => void run(async () => {
              const result = await seed({});
              onReset(result.potId, result.userIds[0]);
              return "Demo pot reset to day 4.";
            }))}
            {button("Reset sidequest demo", () => void run(async () => {
              const result = await seedSidequest({});
              onReset(result.potId, result.userId);
              return "Sidequest demo reset.";
            }))}

            <Text style={styles.heading}>Sidequest stage actions</Text>
            <Text style={styles.note}>The warning uses device GPS when available; otherwise this stage action uses a San Francisco demo location.</Text>
            {button("Trigger 5-minute warning", () => void run(async () => {
              if (!userId) throw new Error("Choose a player first.");
              let lat = 37.7609, lng = -122.3885, fallback = true;
              let timer: ReturnType<typeof setTimeout> | undefined;
              try {
                const location = await Promise.race([
                  (async () => {
                    const permission = await Location.requestForegroundPermissionsAsync();
                    if (!permission.granted) throw new Error("Location permission denied");
                    return await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                  })(),
                  new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("GPS timed out")), 5000); }),
                ]);
                lat = location.coords.latitude; lng = location.coords.longitude; fallback = false;
              } catch {} finally { if (timer) clearTimeout(timer); }
              await triggerWarning({ potId, userId, lat, lng });
              return fallback ? "Warning created using the San Francisco stage location (GPS unavailable)." : "Warning created using device GPS.";
            }), !(isDemo || isSidequestDemo) || dashboard?.pot.status !== "active" || !userId)}
            {button("Skip wait · start sidequest now", () => void run(async () => {
              if (!quest) throw new Error("No sidequest is available.");
              return await startNow({ sidequestId: quest._id }) ? "Sidequest started. Open it from Standings." : "Sidequest was not started.";
            }), !(isDemo || isSidequestDemo) || quest?.status !== "warning_5m")}
            {([['valid_walk', 'Simulate valid walk'], ['uber_spoof', 'Simulate vehicle spoof'], ['screen_photo_spoof', 'Simulate screen-photo spoof'], ['couch_timeout', 'Simulate timeout']] as const).map(([mode, label]) => <View key={mode}>{button(label, () => void run(async () => {
              if (!quest) throw new Error("No sidequest is available.");
              await simulateWalk({ sidequestId: quest._id, mode });
              return "Walk trace submitted for referee review.";
            }), !(isDemo || isSidequestDemo) || !quest || !["warning_5m", "active"].includes(quest.status))}</View>)}

            <Text style={styles.heading}>Pending proof</Text>
            <Text style={styles.note}>{pending ? `Day ${pending.dayIndex} · ${dashboard?.leaderboard.find((member) => member.userId === pending.userId)?.user?.name ?? "Member"}` : "No pending proof on the current day."}</Text>
            {button("Force VLM pass", () => void run(async () => {
              if (!pending) return "No pending proof.";
              const changed = await forceVerdict({ submissionId: pending._id, verdict: "passed" });
              return changed ? "Demo override: proof passed." : "Proof was already evaluated.";
            }), !isDemo || !active || !pending)}
            {button("Force anti-spoof fail", () => void run(async () => {
              if (!pending) return "No pending proof.";
              const changed = await forceVerdict({ submissionId: pending._id, verdict: "failed_spoof" });
              return changed ? "Demo override: spoof detected." : "Proof was already evaluated.";
            }), !isDemo || !active || !pending)}

            <Text style={styles.heading}>Stage actions</Text>
            {button("Replay payment webhook", () => void run(async () => {
              if (!paymentMember?.whopPaymentId) return "No payment available to replay.";
              const eventId = `demo_replay_${Date.now()}_${Math.random().toString(36).slice(2)}`;
              const funded = await simulatePayment({ potId, userId: paymentMember.userId, whopPaymentId: paymentMember.whopPaymentId, eventId });
              return funded ? "Simulated payment funded the membership." : "Simulated replay recorded; the existing payment was not charged twice.";
            }), !isDemo || !paymentMember?.whopPaymentId)}
            {button("Fast-forward daily cutoff", () => void run(async () => {
              const processed = await fastForward({ potId });
              return processed ? "Daily cutoff processed." : "No cutoff processed.";
            }), !active)}
            {button("Simulate Sunday settlement", () => void run(async () => {
              const event = await settle({ potId });
              return event ? "Settlement recorded; wallet balances are simulated and transfer results may be pending." : "No settlement recorded.";
            }), !active)}

            <Text style={styles.heading}>Roast persona</Text>
            {PERSONA_IDS.map((persona) => <View key={persona}>{button(ROAST_PERSONAS[persona].name, () => choosePersona(persona), !active, dashboard?.pot.roastPersona === persona)}</View>)}

            {button(inspector ? "Hide trust & Whop inspector" : "Show trust & Whop inspector", () => setInspector(!inspector), !dashboard)}
            {inspector && dashboard && (
              <View style={styles.inspector}>
                <Text style={styles.heading}>VLM trust scores</Text>
                {dashboard.recentSubmissions.length === 0 && <Text style={styles.note}>No submissions.</Text>}
                {dashboard.recentSubmissions.map((submission) => (
                  <Text key={submission._id} style={styles.note}>
                    Day {submission.dayIndex} · {dashboard.leaderboard.find((member) => member.userId === submission.userId)?.user?.name ?? "Member"} · {submission.verdict} · trust {submission.trustScore ?? "pending"} · gyro variance {submission.gyroVariance} · {submission.evaluationMode ?? "not evaluated"}{submission.spoofSignals.length ? ` · ${submission.spoofSignals.join(", ")}` : ""}
                  </Text>
                ))}
                <Text style={styles.heading}>Whop payment events</Text>
                {events.length === 0 && <Text style={styles.note}>No recent events for this pot.</Text>}
                {events.map((event) => <Text key={event._id} style={styles.note}>{event.eventType} · {event.mode}{"\n"}{event.eventId}{"\n"}{event.payloadSummary}</Text>)}
                <Text style={styles.heading}>Transfers & simulated wallets</Text>
                {dashboard.transferEvents.length === 0 && <Text style={styles.note}>No settlement transfers.</Text>}
                {dashboard.transferEvents.map((transfer) => <Text key={transfer.userId} style={styles.note}>{dashboard.leaderboard.find((member) => member.userId === transfer.userId)?.user?.name ?? "Member"} · ${(transfer.amountCents / 100).toFixed(2)} · {transfer.status} / {transfer.mode} · {transfer.whopTransferId ?? "no transfer ID yet"}</Text>)}
                {dashboard.leaderboard.map((member) => <Text key={member._id} style={styles.note}>{member.user?.name ?? "Member"} · simulated wallet ${((member.user?.simulatedWalletBalanceCents ?? 0) / 100).toFixed(2)} · payment {member.whopPaymentId ?? "none"}</Text>)}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default DemoDrawer;

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(11,27,63,0.5)" },
  drawer: { maxHeight: "90%", backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, elevation: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20 },
  title: { color: C.ink, fontSize: 26, fontFamily: fonts.condensedHeavy },
  close: { color: C.accent, fontFamily: fonts.sansBold },
  content: { paddingHorizontal: 20, paddingBottom: 36, gap: 10 },
  heading: { color: C.ink, fontSize: 18, fontFamily: fonts.condensedHeavy, marginTop: 12 },
  note: { color: C.ink2, fontSize: 12, fontFamily: fonts.sans, lineHeight: 18 },
  message: { color: C.accent, fontSize: 13, fontFamily: fonts.sansSemi },
  button: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 8, padding: 12 },
  selected: { backgroundColor: C.accentSoft, borderColor: C.accent, borderWidth: 1 },
  disabled: { opacity: 0.45 },
  buttonText: { color: C.ink, fontFamily: fonts.sansSemi },
  inspector: { gap: 8, padding: 12, borderRadius: 10, backgroundColor: C.card },
});
