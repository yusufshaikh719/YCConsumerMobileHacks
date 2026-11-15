import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PERSONA_IDS, type PersonaId } from "../../convex/lib/contracts";
import { ROAST_PERSONAS } from "../../convex/personas";

type Props = {
  potId: Id<"pots">;
  visible: boolean;
  onClose: () => void;
  onReset: (potId: Id<"pots">) => void;
};

export function DemoDrawer({ potId, visible, onClose, onReset }: Props) {
  const dashboard = useQuery(api.pots.getPotDashboard, visible ? { potId } : "skip");
  const seed = useMutation(api.demo.seedStageDemoPot);
  const forceVerdict = useMutation(api.demo.forceDemoSubmissionVerdict);
  const simulatePayment = useMutation(api.demo.simulateWhopPayment);
  const fastForward = useMutation(api.demo.fastForwardDailyDeadline);
  const settle = useMutation(api.demo.simulateSundaySettlement);
  const setPersona = useMutation(api.pots.setPotPersona);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [inspector, setInspector] = useState(false);
  const isDemo = dashboard?.pot.whopProductId === "demo_whop_product_gym_pact";
  const active = isDemo && dashboard?.pot.status === "active";
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
            <Text style={styles.note}>Actions modify the seeded demo pot. Payment replay and wallet payouts are simulated.</Text>
            {dashboard === undefined ? <Text style={styles.note}>Loading pot…</Text> : !isDemo ? <Text style={styles.note}>These controls are available for the seeded demo pot only.</Text> : null}
            {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}

            {button("Reset seeded demo", () => void run(async () => {
              const result = await seed({});
              onReset(result.potId);
              return "Demo pot reset to day 4.";
            }))}

            <Text style={styles.heading}>Pending proof</Text>
            <Text style={styles.note}>{pending ? `Day ${pending.dayIndex} · ${dashboard?.leaderboard.find((member) => member.userId === pending.userId)?.user?.name ?? "Member"}` : "No pending proof on the current day."}</Text>
            {button("Force VLM pass", () => void run(async () => {
              if (!pending) return "No pending proof.";
              const changed = await forceVerdict({ submissionId: pending._id, verdict: "passed" });
              return changed ? "Demo override: proof passed." : "Proof was already evaluated.";
            }), !active || !pending)}
            {button("Force anti-spoof fail", () => void run(async () => {
              if (!pending) return "No pending proof.";
              const changed = await forceVerdict({ submissionId: pending._id, verdict: "failed_spoof" });
              return changed ? "Demo override: spoof detected." : "Proof was already evaluated.";
            }), !active || !pending)}

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
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  drawer: { maxHeight: "90%", backgroundColor: "#090B10", borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20 },
  title: { color: "#f9fafb", fontSize: 22, fontWeight: "700" },
  close: { color: "#C8FF2E", fontWeight: "700" },
  content: { paddingHorizontal: 20, paddingBottom: 36, gap: 10 },
  heading: { color: "#f9fafb", fontSize: 16, fontWeight: "700", marginTop: 12 },
  note: { color: "#d1d5db", fontSize: 13 },
  message: { color: "#FF826E", fontSize: 13 },
  button: { backgroundColor: "#20242B", borderRadius: 10, padding: 12 },
  selected: { backgroundColor: "#3B471C", borderColor: "#C8FF2E", borderWidth: 1 },
  disabled: { opacity: 0.45 },
  buttonText: { color: "#fff", fontWeight: "600" },
  inspector: { gap: 8, padding: 12, borderRadius: 10, backgroundColor: "#181C22" },
});
