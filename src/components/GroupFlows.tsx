import { useAction, useMutation, useQuery } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { openBrowserAsync } from "expo-web-browser";
import { useFonts } from "expo-font";
import { BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold } from "@expo-google-fonts/barlow-condensed";
import { Inter_400Regular, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, Text as NativeText, TextInput, View, type TextProps } from "react-native";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { buildCheckoutUrl } from "../services/whop";

type Persona = "drill_sergeant" | "passive_aggressive_roommate" | "wall_street_bro" | "disappointed_coach";
type Slot = { dayOfWeek: number; startMinute: number; endMinute: number };
const personas: [Persona, string][] = [["drill_sergeant", "Drill Sergeant"], ["passive_aggressive_roommate", "Passive-Aggressive Roommate"], ["wall_street_bro", "Wall Street Bro"], ["disappointed_coach", "Disappointed Coach"]];
const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const message = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";
function normalizeSlots(slots: Slot[]) {
  const result: Slot[] = [];
  for (const slot of [...slots].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute)) {
    const last = result[result.length - 1];
    if (last && last.dayOfWeek === slot.dayOfWeek && slot.startMinute <= last.endMinute) last.endMinute = Math.max(last.endMinute, slot.endMinute);
    else result.push({ ...slot });
  }
  return result;
}
function removeWindow(slots: Slot[], dayOfWeek: number, startMinute: number, endMinute: number) {
  return slots.flatMap(slot => {
    if (slot.dayOfWeek !== dayOfWeek || slot.endMinute <= startMinute || slot.startMinute >= endMinute) return [slot];
    return [{ ...slot, endMinute: Math.min(slot.endMinute, startMinute) }, { ...slot, startMinute: Math.max(slot.startMinute, endMinute) }].filter(part => part.endMinute - part.startMinute >= 20);
  });
}

export const FontFallback = createContext(false);
export function FlowText({ style, ...props }: TextProps) {
  const fallback = useContext(FontFallback);
  return <NativeText {...props} style={[style, fallback && { fontFamily: undefined }]} />;
}
const Text = FlowText;

export function parseInviteCode(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(?:https?:\/\/[^/]+\/join\/|ante:\/\/join\/)([a-z0-9]+)\/?(?:[?#].*)?$/i);
  return (match?.[1] ?? trimmed).toUpperCase();
}

function HoldButton({ onDone, disabled, label }: { onDone: () => void; disabled?: boolean; label: string }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  useEffect(() => () => progress.stopAnimation(), [progress]);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Press and hold for one and a half seconds" disabled={disabled} onLayout={e => setWidth(e.nativeEvent.layout.width)} onPressIn={() => {
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: true }).start(({ finished }) => { if (finished) onDone(); });
  }} onPressOut={() => { progress.stopAnimation(); progress.setValue(0); }} style={[s.button, s.hold, disabled && s.disabled]}>
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#FF4D2E", transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] }) }] }]} />
    <Text style={s.buttonText}>{label}</Text>
  </Pressable>;
}

export function Checkout({ potId, userId, stakeCents }: { potId: Id<"pots">; userId: Id<"users">; stakeCents: number }) {
  const createCheckout = useAction(api.whop.createPotCheckout);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [status, setStatus] = useState("");
  const dashboard = useQuery(api.pots.getPotDashboard, { potId });
  const member = dashboard?.leaderboard.find(m => m.userId === userId);
  const open = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setStatus("");
    try {
      const result = await createCheckout({ potId, userId });
      if (result.mode === "fallback") { setStatus("Whop checkout is unavailable (fallback). No payment was collected; your membership is pending."); return; }
      const url = buildCheckoutUrl(result.checkoutUrl);
      if (!url) throw new Error("Whop returned an invalid checkout URL.");
      await openBrowserAsync(url);
      setStatus(`Checkout ${result.checkoutId} opened. Your membership updates after Whop confirms payment.`);
    } catch (e) { setStatus(message(e)); } finally { busyRef.current = false; setBusy(false); }
  };
  if (dashboard === undefined) return <ActivityIndicator color="#0B1B3F" />;
  if (!member) return <Text style={s.error}>Membership not found. Join the group before checkout.</Text>;
  if (member.stakeStatus !== "pending_checkout") return <Text style={s.success}>Membership: {member.stakeStatus.replace(/_/g, " ")}{member.whopPaymentId ? ` · Whop payment ${member.whopPaymentId}` : ""}</Text>;
  return <View style={s.section}>
    <Text style={s.label}>YOUR WEEKLY BUY-IN</Text><Text style={s.price}>{money(stakeCents)}</Text>
    <Text style={s.body}>Secure checkout by Whop. Payment is confirmed by webhook, not by opening checkout.</Text>
    <HoldButton disabled={busy} label={busy ? "OPENING CHECKOUT…" : "HOLD TO CHECK OUT WITH WHOP"} onDone={() => void open()} />
    {status ? <Text accessibilityRole="alert" style={s.note}>{status}</Text> : null}
  </View>;
}

export function JoinByCode({ userId, initialCode = "", onJoined }: { userId: Id<"users">; initialCode?: string; onJoined: (id: Id<"pots">) => void }) {
  const [input, setInput] = useState(initialCode);
  const [lookup, setLookup] = useState(parseInviteCode(initialCode));
  const [joined, setJoined] = useState<Id<"pots"> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pot = useQuery(api.pots.getPotByInviteCode, lookup ? { inviteCode: lookup } : "skip");
  const dashboard = useQuery(api.pots.getPotDashboard, pot ? { potId: pot._id } : "skip");
  const join = useMutation(api.pots.joinPotByInviteCode);
  const submit = async () => {
    if (!pot || busy) return;
    setBusy(true); setError("");
    try { const result = await join({ inviteCode: lookup, userId }); setJoined(result.potId); onJoined(result.potId); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };
  return <View style={s.section}>
    <Text style={s.heading}>JOIN A GROUP</Text><Text style={s.body}>Paste an invite code or link.</Text>
    <TextInput value={input} onChangeText={setInput} autoCapitalize="characters" placeholder="CODE or ante://join/CODE" placeholderTextColor="#737A8C" style={s.input} />
    <Pressable accessibilityRole="button" style={s.outlineButton} onPress={() => { const code = parseInviteCode(input); setJoined(null); setError(code ? "" : "Enter an invite code or link."); setLookup(code); }}><Text style={s.outlineText}>FIND GROUP</Text></Pressable>
    {lookup && pot === undefined ? <ActivityIndicator color="#0B1B3F" /> : null}
    {lookup && pot === null ? <Text accessibilityRole="alert" style={s.error}>No group found for that code.</Text> : null}
    {pot ? <View style={s.inset}><Text style={s.cardTitle}>{pot.title}</Text><Text style={s.body}>{pot.habitPrompt} · {money(pot.stakeCents)} weekly</Text><Text style={s.note}>{dashboard === undefined ? "Loading members…" : dashboard?.leaderboard.length ? `Members: ${dashboard.leaderboard.map(m => m.user?.name ?? "Unknown player").join(", ")}` : "No members yet."}</Text>
      {!joined ? <Pressable accessibilityRole="button" disabled={busy} style={[s.button, busy && s.disabled]} onPress={() => void submit()}><Text style={s.buttonText}>{busy ? "JOINING…" : "JOIN GROUP"}</Text></Pressable> : <Checkout key={`${joined}:${userId}`} potId={joined} userId={userId} stakeCents={pot.stakeCents} />}
    </View> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
  </View>;
}

export function Availability({ potId, userId }: { potId: Id<"pots">; userId: Id<"users"> }) {
  const saved = useQuery(api.availability.getUserAvailability, { potId, userId });
  const save = useMutation(api.availability.setAvailabilityWindows);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [customDay, setCustomDay] = useState(1);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const initialized = useRef(false);
  useEffect(() => { if (saved === undefined || initialized.current) return; initialized.current = true; setSlots(normalizeSlots(saved?.slots ?? [])); setTimezone(saved?.timezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles")); }, [saved]);
  const toggle = (dayOfWeek: number, hour: number) => {
    const startMinute = hour * 60, endMinute = Math.min(startMinute + 60, 1439);
    setSlots(previous => {
      const overlaps = previous.some(slot => slot.dayOfWeek === dayOfWeek && slot.startMinute < endMinute && slot.endMinute > startMinute);
      if (!overlaps) return normalizeSlots([...previous, { dayOfWeek, startMinute, endMinute }]);
      return removeWindow(previous, dayOfWeek, startMinute, endMinute);
    });
    setNotice("");
  };
  const submit = async () => {
    setBusy(true); setError(""); setNotice("");
    try { await save({ potId, userId, timezone: timezone.trim(), slots }); setNotice("Availability saved."); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };
  const addCustom = () => {
    const parse = (value: string) => { const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim()); if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null; return Number(match[1]) * 60 + Number(match[2]); };
    const startMinute = parse(startTime), endMinute = parse(endTime);
    if (startMinute === null || endMinute === null || endMinute - startMinute < 20) { setError("Use valid same-day times (HH:MM) at least 20 minutes apart, ending no later than 23:59."); return; }
    setSlots(previous => normalizeSlots([...previous, { dayOfWeek: customDay, startMinute, endMinute }])); setError(""); setNotice("");
  };
  return <View style={s.section}>
    <Text style={s.heading}>YOUR FREE TIME</Text><Text style={s.body}>Tap hours when you can take a sidequest. Times are local to the timezone below. Partial windows are highlighted; removing an hour also removes any remaining fragment shorter than 20 minutes.</Text>
    <Text style={s.label}>TIMEZONE</Text><TextInput value={timezone} onChangeText={setTimezone} autoCapitalize="none" placeholder="America/Los_Angeles" placeholderTextColor="#737A8C" style={s.input} />
    <Text style={s.label}>QUICK WINDOWS · EVERY DAY</Text><View style={s.chips}>{([["Morning 7–9", 7, 9], ["Lunch 12–2", 12, 14], ["After work 5–7", 17, 19], ["Evening 7–9", 19, 21]] as const).map(([label, start, end]) => {
      const startMinute = start * 60, endMinute = end * 60;
      const selected = days.every((_, dayOfWeek) => slots.some(slot => slot.dayOfWeek === dayOfWeek && slot.startMinute <= startMinute && slot.endMinute >= endMinute));
      return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: saved === undefined }} disabled={saved === undefined} key={label} style={[s.chip, selected && s.chipSelected]} onPress={() => { setSlots(previous => selected ? days.reduce((result, _, dayOfWeek) => removeWindow(result, dayOfWeek, startMinute, endMinute), previous) : normalizeSlots([...previous, ...days.map((_, dayOfWeek) => ({ dayOfWeek, startMinute, endMinute }))])); setNotice(""); }}><Text style={[s.chipText, selected && s.chipTextSelected]}>{label}</Text></Pressable>;
    })}</View>
    <Text style={s.label}>CUSTOM WINDOW · {days[customDay]}</Text><View style={s.chips}>{days.map((day, i) => <Pressable key={day} onPress={() => setCustomDay(i)} style={[s.chip, customDay === i && s.chipSelected]}><Text style={[s.chipText, customDay === i && s.chipTextSelected]}>{day}</Text></Pressable>)}</View><View style={s.chips}><TextInput accessibilityLabel="Start time" value={startTime} onChangeText={setStartTime} placeholder="09:00" style={[s.input, { flex: 1 }]} /><TextInput accessibilityLabel="End time" value={endTime} onChangeText={setEndTime} placeholder="10:00" style={[s.input, { flex: 1 }]} /></View><Pressable disabled={saved === undefined} style={[s.outlineButton, saved === undefined && s.disabled]} onPress={addCustom}><Text style={s.outlineText}>ADD CUSTOM WINDOW</Text></Pressable>
    {saved === undefined ? <ActivityIndicator color="#0B1B3F" /> : <View style={s.grid}>
      <View style={s.row}><Text style={s.hour} />{days.map(day => <Text key={day} style={s.day}>{day}</Text>)}</View>
      {Array.from({ length: 24 }, (_, hour) => <View style={s.row} key={hour}><Text style={s.hour}>{String(hour).padStart(2, "0")}:00</Text>{days.map((day, dayOfWeek) => {
        const start = hour * 60, end = Math.min(start + 60, 1439);
        const selected = slots.some(slot => slot.dayOfWeek === dayOfWeek && slot.startMinute < end && slot.endMinute > start);
        return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`${day} ${hour}:00`} key={day} onPress={() => toggle(dayOfWeek, hour)} style={[s.cell, selected && s.cellSelected]} />;
      })}</View>)}
    </View>}
    <Pressable accessibilityRole="button" disabled={busy || saved === undefined} style={[s.button, (busy || saved === undefined) && s.disabled]} onPress={() => void submit()}><Text style={s.buttonText}>{busy ? "SAVING…" : "SAVE AVAILABILITY"}</Text></Pressable>
    {notice ? <Text style={s.success}>{notice}</Text> : null}{error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
  </View>;
}

export default function GroupFlows({ potId, userId, onPotChange }: { potId: Id<"pots">; userId: Id<"users">; onPotChange: (id: Id<"pots">) => void }) {
  const [fontsLoaded, fontError] = useFonts({ BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold, Inter_400Regular, Inter_600SemiBold });
  const create = useMutation(api.pots.createPot);
  const join = useMutation(api.pots.joinPotPendingCheckout);
  const setPersona = useMutation(api.pots.setPotPersona);
  const [title, setTitle] = useState(""); const [habit, setHabit] = useState(""); const [stake, setStake] = useState("10.00"); const [handles, setHandles] = useState("");
  const [persona, setPersonaChoice] = useState<Persona>("drill_sergeant");
  const [created, setCreated] = useState<Id<"pots"> | null>(null);
  const [createdJoined, setCreatedJoined] = useState(false);
  const [pendingPot, setPendingPot] = useState<Id<"pots"> | null>(null);
  const activePotId = pendingPot ?? potId;
  const dashboard = useQuery(api.pots.getPotDashboard, { potId: activePotId });
  useEffect(() => { setPendingPot(null); }, [potId]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [copied, setCopied] = useState(false);
  const start = async () => {
    if (!title.trim() || !habit.trim()) { setError("Enter a group name and a daily challenge."); return; }
    if (!/^\d+(?:\.\d{1,2})?$/.test(stake.trim())) { setError("Enter a valid dollar amount with up to two decimal places."); return; }
    const cents = Math.round(Number(stake) * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0) { setError("The weekly stake must be greater than zero."); return; }
    setBusy(true); setError("");
    try {
      const id = created ?? await create({ title, habitCategory: "custom", habitPrompt: habit, createdByUserId: userId, stakeCents: cents, roastPersona: persona, challengeMode: "sidequest", invitedHandles: handles.split(/[\s,]+/).map(h => h.trim()).filter(Boolean) });
      setCreated(id);
      await join({ potId: id, userId });
      setCreatedJoined(true);
      setPendingPot(id);
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };
  const changePersona = async (value: Persona) => { try { await setPersona({ potId: activePotId, roastPersona: value }); } catch (e) { setError(message(e)); } };
  if (!fontsLoaded && !fontError) return <ActivityIndicator color="#0B1B3F" />;
  return <FontFallback.Provider value={!!fontError}><ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Text style={s.eyebrow}>ANTE / THE CLUBHOUSE</Text><Text style={s.title}>YOUR GROUPS.</Text><Text style={s.body}>Make a commitment. Bring your people.</Text>
    <View style={s.section}><Text style={s.heading}>NEW GROUP</Text>
      <Text style={s.label}>GROUP NAME</Text><TextInput editable={!created} value={title} onChangeText={setTitle} placeholder="The morning crew" placeholderTextColor="#737A8C" style={s.input} />
      <Text style={s.label}>DAILY CHALLENGE</Text><TextInput editable={!created} value={habit} onChangeText={setHabit} placeholder="Get outside every day" placeholderTextColor="#737A8C" style={s.input} />
      <Text style={s.label}>WEEKLY STAKE ($)</Text><View style={s.chips}>{[5, 10, 25, 50].map(value => <Pressable disabled={!!created} key={value} onPress={() => setStake(value.toFixed(2))} style={[s.chip, Number(stake) === value && s.chipSelected]}><Text style={[s.chipText, Number(stake) === value && s.chipTextSelected]}>${value}</Text></Pressable>)}</View><TextInput editable={!created} value={stake} onChangeText={setStake} keyboardType="decimal-pad" style={s.input} />
      <Text style={s.label}>INVITE HANDLES</Text><TextInput editable={!created} value={handles} onChangeText={setHandles} autoCapitalize="none" placeholder="@alex, @sam" placeholderTextColor="#737A8C" style={s.input} /><Text style={s.note}>Separate handles with commas or spaces. Unknown handles are created as invited users.</Text>
      <Text style={s.label}>ROAST PERSONA</Text><View style={s.chips}>{personas.map(([id, name]) => <Pressable disabled={!!created} accessibilityRole="button" key={id} onPress={() => setPersonaChoice(id)} style={[s.chip, persona === id && s.chipSelected]}><Text style={[s.chipText, persona === id && s.chipTextSelected]}>{name}</Text></Pressable>)}</View>
      {!createdJoined ? <Pressable disabled={busy} accessibilityRole="button" style={[s.button, busy && s.disabled]} onPress={() => void start()}><Text style={s.buttonText}>{busy ? "CREATING…" : created ? "RETRY JOINING GROUP" : "CREATE GROUP"}</Text></Pressable> : <Text style={s.success}>Group created. Share the invite and complete checkout below.</Text>}
      {createdJoined ? <Pressable style={s.outlineButton} onPress={() => { setCreated(null); setCreatedJoined(false); setTitle(""); setHabit(""); setHandles(""); setError(""); }}><Text style={s.outlineText}>START ANOTHER GROUP</Text></Pressable> : null}
    </View>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {dashboard ? <View style={s.section}><Text style={s.label}>CURRENT GROUP</Text><Text style={s.heading}>{dashboard.pot.title.toUpperCase()}</Text><Text style={s.body}>{money(dashboard.pot.stakeCents)} weekly · {dashboard.pot.status}</Text>
      {dashboard.pot.inviteCode ? <><Text style={s.label}>INVITE CODE · {dashboard.pot.inviteCode}</Text><Text style={s.body}>ante://join/{dashboard.pot.inviteCode}</Text><Pressable accessibilityRole="button" style={s.outlineButton} onPress={() => { void Clipboard.setStringAsync(`ante://join/${dashboard.pot.inviteCode}`).then(() => setCopied(true)).catch(e => setError(message(e))); }}><Text style={s.outlineText}>{copied ? "COPIED" : "COPY INVITE LINK"}</Text></Pressable></> : <Text style={s.note}>This group has no invite code.</Text>}
      <Text style={s.label}>GROUP PERSONA</Text><View style={s.chips}>{personas.map(([id, name]) => <Pressable accessibilityRole="button" key={id} onPress={() => void changePersona(id)} style={[s.chip, dashboard.pot.roastPersona === id && s.chipSelected]}><Text style={[s.chipText, dashboard.pot.roastPersona === id && s.chipTextSelected]}>{name}</Text></Pressable>)}</View>
      {dashboard.leaderboard.some(m => m.userId === userId) ? <Checkout key={`${activePotId}:${userId}`} potId={activePotId} userId={userId} stakeCents={dashboard.pot.stakeCents} /> : <Text style={s.note}>Join this group before checking out.</Text>}
      {pendingPot && pendingPot !== potId ? <Pressable accessibilityRole="button" style={s.outlineButton} onPress={() => onPotChange(pendingPot)}><Text style={s.outlineText}>OPEN THIS GROUP</Text></Pressable> : null}
    </View> : null}
    <JoinByCode key={userId} userId={userId} onJoined={setPendingPot} />
    <Availability key={`${activePotId}:${userId}`} potId={activePotId} userId={userId} />
    <Text style={s.footer}>ANTE POWERED BY WHOP</Text>
  </ScrollView></FontFallback.Provider>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F3EF" }, content: { padding: 20, paddingBottom: 48, gap: 12 }, section: { backgroundColor: "#FFFFFF", padding: 18, marginTop: 12, gap: 9, borderWidth: 1, borderColor: "#E3E1DA", borderRadius: 4, elevation: 1 }, inset: { padding: 12, backgroundColor: "#F4F3EF", gap: 8 }, eyebrow: { color: "#FF4D2E", fontFamily: "BarlowCondensed_700Bold", fontSize: 13, letterSpacing: 2 }, title: { color: "#0B1B3F", fontFamily: "BarlowCondensed_800ExtraBold", fontSize: 42, lineHeight: 44 }, heading: { color: "#0B1B3F", fontFamily: "BarlowCondensed_800ExtraBold", fontSize: 25, letterSpacing: .5 }, cardTitle: { color: "#0B1B3F", fontFamily: "BarlowCondensed_700Bold", fontSize: 22 }, body: { color: "#3A4766", fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20 }, note: { color: "#737A8C", fontSize: 12, lineHeight: 18 }, label: { color: "#737A8C", fontFamily: "BarlowCondensed_700Bold", fontSize: 12, letterSpacing: 1.4, marginTop: 8 }, input: { color: "#0B1B3F", backgroundColor: "#F4F3EF", borderWidth: 1, borderColor: "#E3E1DA", paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, chip: { borderWidth: 1, borderColor: "#E3E1DA", paddingVertical: 8, paddingHorizontal: 10 }, chipSelected: { backgroundColor: "#0B1B3F", borderColor: "#0B1B3F" }, chipText: { color: "#0B1B3F", fontSize: 12 }, chipTextSelected: { color: "#FFFFFF" }, button: { minHeight: 52, backgroundColor: "#0B1B3F", alignItems: "center", justifyContent: "center", padding: 12, marginTop: 7, overflow: "hidden" }, hold: { borderWidth: 1, borderColor: "#0B1B3F" }, buttonText: { color: "#FFFFFF", fontFamily: "BarlowCondensed_700Bold", fontSize: 17, letterSpacing: 1 }, outlineButton: { borderWidth: 1, borderColor: "#0B1B3F", alignItems: "center", padding: 12, marginTop: 5 }, outlineText: { color: "#0B1B3F", fontFamily: "BarlowCondensed_700Bold", letterSpacing: 1 }, disabled: { opacity: .5 }, price: { color: "#0B1B3F", fontFamily: "BarlowCondensed_800ExtraBold", fontSize: 36, fontVariant: ["tabular-nums"] }, success: { color: "#13A05F", fontSize: 13, lineHeight: 19 }, error: { color: "#C72C1C", fontSize: 13, lineHeight: 19 }, grid: { gap: 3, marginTop: 6 }, row: { flexDirection: "row", alignItems: "center", gap: 3 }, hour: { width: 38, color: "#737A8C", fontSize: 10, fontVariant: ["tabular-nums"] }, day: { flex: 1, color: "#737A8C", fontSize: 9, textAlign: "center", fontWeight: "700" }, cell: { flex: 1, height: 25, backgroundColor: "#F4F3EF", borderWidth: 1, borderColor: "#E3E1DA" }, cellSelected: { backgroundColor: "#13A05F", borderColor: "#13A05F" }, footer: { color: "#737A8C", textAlign: "center", fontSize: 10, letterSpacing: 1.3, marginTop: 12 },
});
