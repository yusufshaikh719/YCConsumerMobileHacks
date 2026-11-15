import { useAction } from "convex/react";
import { openBrowserAsync } from "expo-web-browser";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { buildCheckoutUrl } from "../services/whop";

export default function PremiumPaywall({ userId }: { userId: Id<"users"> }) {
  const createCheckout = useAction(api.whop.createPremiumCheckout);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState(false);

  const purchase = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const checkout = await createCheckout({ userId });
      if (checkout.mode === "fallback") throw new Error("Checkout unavailable");
      const url = buildCheckoutUrl(checkout.purchase_url);
      if (!url) throw new Error("Whop returned an invalid checkout URL");
      await openBrowserAsync(url);
      setOpened(true);
    } catch {
      setError("Checkout couldn't open. Please try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return <ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.eyebrow}>ANTE PREMIUM</Text>
    <Text style={styles.title}>Make it count.</Text>
    <Text style={styles.description}>Unlock your arena, daily proof, and pot chat with a one-time premium purchase.</Text>
    <Text style={styles.price}>$10 <Text style={styles.once}>/ one time</Text></Text>
    <Text style={styles.note}>Premium access is separate from your pot's weekly stake.</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void purchase()} style={[styles.button, busy && styles.disabled]}>
      {busy ? <ActivityIndicator color="#10130B" /> : <Text style={styles.buttonText}>Unlock with Whop →</Text>}
    </Pressable>
    <Text style={styles.note}>{opened ? "Waiting for payment confirmation. Your access updates automatically after Whop verifies payment." : "Secure checkout hosted by Whop. Access unlocks only after payment is verified."}</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: 28, gap: 18 },
  eyebrow: { color: "#C8FF2E", fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  title: { color: "#FFFFFF", fontSize: 38, fontWeight: "900", letterSpacing: -1 },
  description: { color: "#C0C6CF", fontSize: 16, lineHeight: 25 },
  price: { color: "#FFFFFF", fontSize: 42, fontWeight: "900" },
  once: { color: "#9BA3AD", fontSize: 15, fontWeight: "500" },
  note: { color: "#9BA3AD", fontSize: 12, lineHeight: 19 },
  button: { backgroundColor: "#C8FF2E", padding: 18, borderRadius: 14, alignItems: "center" },
  buttonText: { color: "#10130B", fontSize: 15, fontWeight: "900" },
  disabled: { opacity: 0.6 },
  error: { color: "#FF6079", fontSize: 13 },
});
