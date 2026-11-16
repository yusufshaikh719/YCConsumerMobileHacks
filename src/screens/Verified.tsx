import { StatusBar } from "expo-status-bar";
import { useEffect, useRef } from "react";
import { Animated, Easing, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { Photo } from "../components/Photo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../components/Avatar";
import { Button } from "../components/Button";
import { InviteCard } from "../components/InviteCard";
import { Paper } from "../components/Paper";
import { Perforation } from "../components/Perforation";
import { Postmark } from "../components/Postmark";
import { haptic } from "../lib/haptics";
import { money, ordinal } from "../lib/money";
import { formatTimeOfDay } from "../lib/time";
import { passedMembers, payoutPreview } from "../services/standings";
import type { Verification } from "../services/types";
import { useAnte } from "../state/AnteProvider";
import { useReducedMotion } from "../theme/motion";
import { Text } from "../theme/Text";
import { colors, radius, space } from "../theme/tokens";

type Result = Extract<Verification, { ok: true }>;

export function Verified({ result }: { result: Result }) {
  const { data, dispatch } = useAnte();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const thunk = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const rise = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      haptic.success();
      return;
    }
    const impact = setTimeout(() => haptic.slam(), 820);
    Animated.sequence([
      Animated.delay(450),
      Animated.spring(thunk, { toValue: 1, friction: 4.5, tension: 120, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    return () => clearTimeout(impact);
  }, [thunk, rise, reduced]);

  const { postcard, before, after } = result;
  const me = after.find(s => s.member.id === data.meId);
  const was = before.find(s => s.member.id === data.meId);
  const passed = passedMembers(before, after, data.meId);
  const payout = payoutPreview(after, data.potCents, data.meId);
  const cardWidth = Math.min(width - space.xl * 2, 330);
  const stampSize = cardWidth * 0.42;
  const alone = after.length < 2;
  const headline = alone ? "Stamp collected" : passed.length ? `You passed ${passed.map(m => m.name).join(" and ")}` : me?.rank === 1 ? "Still on top" : "Stamp collected";

  return (
    <Paper>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg, alignItems: "center" }} showsVerticalScrollIndicator={false}>
        <Text variant="label" color={colors.leaf}>Sidequest complete</Text>
        <View style={[styles.card, { width: cardWidth }]}>
          <Photo source={postcard.photo} style={[styles.photo, { height: cardWidth * 1.08 }]} />
          <View style={[styles.caption, { paddingRight: stampSize * 0.55 }]}>
            <Text variant="heading" numberOfLines={3}>{postcard.landmark.name}</Text>
            <Text variant="small" color={colors.muted}>{postcard.landmark.neighborhood} · {formatTimeOfDay(postcard.completedAt)}</Text>
            {postcard.verifiedBy && <Text variant="small" color={colors.muted}>{postcard.verifiedBy === "photo_ai" ? "Verified by GPS and your selfie" : "Verified by GPS only, the selfie wasn't checked"}</Text>}
          </View>
          <Perforation color={colors.paper} edge="top" count={22} />
          <Perforation color={colors.paper} edge="bottom" count={22} />
          <Animated.View
            style={[
              styles.stamp,
              {
                right: -stampSize * 0.18,
                bottom: cardWidth * 0.12,
                opacity: thunk.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
                transform: [
                  { scale: thunk.interpolate({ inputRange: [0, 1], outputRange: [2.6, 1] }) },
                  { rotate: thunk.interpolate({ inputRange: [0, 1], outputRange: ["-28deg", "0deg"] }) },
                ],
              },
            ]}
          >
            <Postmark size={stampSize} top={postcard.landmark.name.toUpperCase()} middle={formatTimeOfDay(postcard.completedAt).replace(" ", "")} bottom={`${postcard.minutesTaken} MIN`} />
          </Animated.View>
        </View>

        <Animated.View style={[styles.below, { opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}>
          <Text variant="display" align="center" numberOfLines={3} adjustsFontSizeToFit maxFontSizeMultiplier={1.2}>{headline}</Text>
          <Text variant="body" color={colors.inkSoft} align="center">
            {alone
              ? `${me?.completed ?? 1} ${me?.completed === 1 ? "stamp" : "stamps"} this week. Invite friends to turn it into a race for the pot.`
              : payout.leading
              ? `You lead the ${money(data.potCents)} pot${payout.leaders > 1 ? `, split ${payout.leaders} ways right now` : ""}.`
              : `${ordinal(me?.rank ?? 0)} of ${after.length} with ${me?.completed} stamps. The ${money(data.potCents)} pot pays the leader Sunday.`}
          </Text>

          {alone ? (
            <View style={styles.invite}>
              <InviteCard data={data} title="Make it a race" body={`Everyone puts ${money(data.stakeCents)} in. Most stamps by Sunday takes the pot.`} />
            </View>
          ) : (
          <View style={styles.board}>
            {after.slice(0, 4).map(s => {
              const old = before.find(b => b.member.id === s.member.id)?.rank ?? s.rank;
              const mine = s.member.id === data.meId;
              return (
                <View key={s.member.id} style={[styles.row, mine && styles.rowMine]}>
                  <Text variant="title" color={mine ? colors.leaf : colors.muted} style={styles.rank} maxFontSizeMultiplier={1.15}>{s.rank}</Text>
                  <Avatar member={s.member} size={30} ring={mine ? colors.leafSoft : colors.card} />
                  <Text variant="bodyStrong" style={styles.flex} numberOfLines={1}>{mine ? "You" : s.member.name}</Text>
                  {old !== s.rank && <Text variant="small" numberOfLines={1} color={old > s.rank ? colors.leaf : colors.muted}>{old > s.rank ? `▲ ${old - s.rank}` : `▼ ${s.rank - old}`}</Text>}
                  <Text variant="title" maxFontSizeMultiplier={1.15}>{s.completed}</Text>
                </View>
              );
            })}
          </View>
          )}
          {!alone && was && me && was.rank !== me.rank && <Text variant="small" color={colors.muted} align="center">Up from {ordinal(was.rank)} before this stamp</Text>}
          <View style={styles.cta}>
            <Button label="Back to waiting" onPress={() => dispatch({ type: "DONE" })} />
          </View>
        </Animated.View>
      </ScrollView>
    </Paper>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: space.md, backgroundColor: colors.card, padding: 12, borderRadius: radius.sm, transform: [{ rotate: "-1.5deg" }], shadowColor: "#3B3424", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  photo: { width: "100%", borderRadius: 3 },
  caption: { paddingTop: space.sm, paddingBottom: 2 },
  stamp: { position: "absolute" },
  below: { alignSelf: "stretch", paddingHorizontal: space.lg, marginTop: space.lg, gap: space.xs },
  board: { marginTop: space.sm, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardEdge, paddingVertical: space.xxs },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, minHeight: 48 },
  rowMine: { backgroundColor: colors.leafSoft },
  rank: { minWidth: 20 },
  flex: { flex: 1, minWidth: 0 },
  invite: { marginHorizontal: -space.lg, marginTop: space.sm },
  cta: { marginTop: space.md },
});
