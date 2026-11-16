import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArmedIndicator } from "../components/ArmedIndicator";
import { Avatar } from "../components/Avatar";
import { IconButton } from "../components/IconButton";
import { InviteCard } from "../components/InviteCard";
import { Paper } from "../components/Paper";
import { Postcard } from "../components/Postcard";
import { PotStatus } from "../components/PotStatus";
import { money, ordinal } from "../lib/money";
import { notificationsAvailable } from "../lib/notifications";
import { formatTimeOfDay, isInWindows, isSameDay, nextWindowStart, weekdayShort } from "../lib/time";
import { useNow } from "../lib/useNow";
import { useAnte } from "../state/AnteProvider";
import { Text } from "../theme/Text";
import { colors, radius, space } from "../theme/tokens";

export function Waiting({ preview }: { preview?: "open" | "closed" }) {
  const { data, notificationsOn, retryNotifications } = useAnte();
  const insets = useSafeAreaInsets();
  const now = useNow(30_000);
  const open = preview ? preview === "open" : isInWindows(data.windows, now);
  const nextOpen = nextWindowStart(data.windows, now);
  const opensToday = nextOpen !== null && isSameDay(nextOpen, now);
  const today = data.postcards.filter(p => isSameDay(p.completedAt, now));
  const me = data.standings.find(s => s.member.id === data.meId);
  const byId = Object.fromEntries(data.group.members.map(m => [m.id, m]));
  const leader = data.standings[0];
  const alone = data.group.members.length < 2;

  return (
    <Paper>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.xs, paddingBottom: insets.bottom + space.xl }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${data.group.name}, change group`} onPress={() => router.push("/onboarding")} hitSlop={8}>
            <Text variant="title">Ante</Text>
            <Text variant="small" color={colors.muted}>{data.group.name} ›</Text>
          </Pressable>
          <View style={styles.actions}>
            <IconButton icon="albums-outline" label="Group feed" onPress={() => router.push("/feed")} />
            <IconButton icon="settings-outline" label="Settings" onPress={() => router.push("/settings")} />
          </View>
        </View>

        <View style={styles.hero}>
          <ArmedIndicator size={208} armed={open} />
          <Text variant="label" color={open ? colors.leaf : colors.muted} style={styles.state}>{open ? "Armed" : "Resting"}</Text>
          <Text variant="display" align="center">{open ? "Could be any minute." : nextOpen === null ? "No windows set" : `Window opens ${formatTimeOfDay(nextOpen)}`}</Text>
          <Text variant="body" color={colors.inkSoft} align="center" style={styles.sub}>
            {open ? "Keep your phone close. You'll get one minute's warning." : opensToday ? "Your next sidequest window opens later today." : "Your windows are done for today. Rest up."}
          </Text>
        </View>

        {notificationsOn === false && !notificationsAvailable() && (
          <View style={styles.notice}>
            <Text variant="bodyStrong">Notifications aren't available in this build</Text>
            <Text variant="small" color={colors.inkSoft}>You'll only see a sidequest ping while Ante is open.</Text>
          </View>
        )}
        {notificationsOn === false && notificationsAvailable() && (
          <Pressable accessibilityRole="button" onPress={() => void retryNotifications()} style={({ pressed }) => [styles.notice, pressed && styles.pressed]}>
            <Text variant="bodyStrong">Turn on notifications</Text>
            <Text variant="small" color={colors.inkSoft}>Ante gives you one minute's warning before a sidequest. Without notifications, you'll only see it with the app open.</Text>
          </Pressable>
        )}

        <View style={styles.sectionHead}>
          <Text variant="label" color={colors.muted}>Today's postcards</Text>
          {!alone && <Text variant="small" color={colors.muted}>{today.length} of {data.group.members.length}</Text>}
        </View>
        {today.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stack}>
            {today.map((card, i) => (
              <Pressable key={card.id} onPress={() => router.push("/feed")} style={{ marginLeft: i === 0 ? 0 : -14, marginTop: i % 2 ? 10 : 0, transform: [{ rotate: `${i % 2 === 0 ? -3 : 2.5}deg` }], zIndex: i }}>
                <Postcard card={card} member={byId[card.memberId]} width={156} showStamp={false} />
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.empty}>
            <Text variant="body" color={colors.muted}>{alone ? "Your first stamp of the day lands here." : "No postcards yet today. First stamp sets the pace."}</Text>
          </View>
        )}

        <Pressable accessibilityRole="button" accessibilityLabel="Open this week's standings" onPress={() => router.push("/feed")} style={({ pressed }) => [styles.pot, pressed && styles.pressed]}>
          <View style={styles.potTop}>
            <View>
              <Text variant="label" color={colors.muted}>This week's pot</Text>
              <Text variant="hero" style={styles.potAmount}>{money(data.potCents)}</Text>
            </View>
            <View style={styles.rank}>
              <Text variant="label" color={colors.muted}>{alone ? "Players" : "You're"}</Text>
              <Text variant="hero" color={!alone && me?.rank === 1 ? colors.leaf : colors.ink} style={styles.potAmount}>{alone ? "1" : me ? ordinal(me.rank) : "–"}</Text>
            </View>
          </View>
          <View style={styles.rule} />
          <View style={styles.potBottom}>
            <View style={styles.faces}>
              {data.standings.slice(0, 4).map((s, i) => <View key={s.member.id} style={{ marginLeft: i ? -8 : 0 }}><Avatar member={s.member} size={28} ring={colors.card} /></View>)}
            </View>
            <Text variant="small" color={colors.inkSoft} style={styles.flex} numberOfLines={2}>
              {alone ? `Just you so far, with ${me?.completed ?? 0} ${me?.completed === 1 ? "stamp" : "stamps"}` : me?.rank === 1 ? `You lead with ${me.completed} stamps` : me?.completed === leader?.completed ? `Tied at ${me?.completed} with ${leader?.member.name}, who was faster` : `${leader?.member.name} leads with ${leader?.completed}, you have ${me?.completed ?? 0}`}. Pot pays out {weekdayShort(data.weekEndsAt)} 9 PM.
            </Text>
          </View>
        </Pressable>

        {data.funding.myStake === "unpaid" && <PotStatus data={data} />}

        {alone && (
          <View style={styles.invite}>
            <InviteCard data={data} title="Better with friends" body={`Sidequests are a race. Everyone puts ${money(data.stakeCents)} in, and whoever stamps the most landmarks by Sunday takes the pot.`} />
          </View>
        )}

        <Pressable accessibilityRole="button" onPress={() => router.push("/passport")} style={({ pressed }) => [styles.passport, pressed && styles.pressed]}>
          <Text variant="bodyStrong" color={colors.leaf}>Your passport</Text>
          <Text variant="small" color={colors.muted}>{me?.completed ?? 0} stamps this week →</Text>
        </Pressable>
      </ScrollView>
    </Paper>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg, paddingTop: space.xs },
  actions: { flexDirection: "row", gap: space.xs },
  hero: { alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xl, gap: space.xs },
  state: { marginTop: space.sm },
  sub: { maxWidth: 300 },
  notice: { marginHorizontal: space.lg, marginBottom: space.lg, padding: space.md, gap: 4, borderRadius: radius.md, backgroundColor: colors.leafSoft, borderWidth: 1, borderColor: colors.leaf },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingHorizontal: space.lg, marginBottom: space.sm },
  stack: { paddingHorizontal: space.lg, paddingVertical: space.sm, paddingRight: space.xl },
  empty: { marginHorizontal: space.lg, padding: space.lg, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.rule },
  pot: { marginHorizontal: space.lg, marginTop: space.lg, padding: space.md, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardEdge },
  potTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  potAmount: { fontSize: 56, lineHeight: 58 },
  rank: { alignItems: "flex-end" },
  rule: { height: 1, backgroundColor: colors.cardEdge, marginVertical: space.sm },
  potBottom: { flexDirection: "row", alignItems: "center", gap: space.sm },
  faces: { flexDirection: "row" },
  flex: { flex: 1 },
  invite: { marginTop: space.lg },
  passport: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginHorizontal: space.lg, marginTop: space.sm, paddingHorizontal: space.md, minHeight: 52, borderRadius: radius.md },
  pressed: { opacity: 0.7 },
});
