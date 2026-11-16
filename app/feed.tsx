import { StatusBar } from "expo-status-bar";
import { StyleSheet, useWindowDimensions, View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "../src/components/Avatar";
import { IconButton } from "../src/components/IconButton";
import { InviteCard } from "../src/components/InviteCard";
import { Paper } from "../src/components/Paper";
import { Postcard } from "../src/components/Postcard";
import { PotStatus } from "../src/components/PotStatus";
import { Reactions } from "../src/components/Reactions";
import { ScreenHeader } from "../src/components/ScreenHeader";
import { shareInvite } from "../src/lib/invite";
import { money } from "../src/lib/money";
import { isSameDay, weekdayShort } from "../src/lib/time";
import { ante } from "../src/services";
import { useAnte } from "../src/state/AnteProvider";
import { Text } from "../src/theme/Text";
import { colors, radius, space } from "../src/theme/tokens";

export default function Feed() {
  const { data } = useAnte();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const byId = Object.fromEntries(data.group.members.map(m => [m.id, m]));
  const top = data.standings[0]?.completed || 1;
  const column = (width - space.lg * 2 - space.md) / 2;
  const days: { label: string; cards: typeof data.postcards }[] = [];
  const now = Date.now();
  for (const card of [...data.postcards].sort((a, b) => b.completedAt - a.completedAt)) {
    const label = isSameDay(card.completedAt, now) ? "Today" : isSameDay(card.completedAt, now - 86_400_000) ? "Yesterday" : weekdayShort(card.completedAt);
    const day = days.at(-1);
    if (day?.label === label) day.cards.push(card);
    else days.push({ label, cards: [card] });
  }
  const alone = data.group.members.length < 2;

  return (
    <Paper style={{ paddingTop: insets.top }}>
      <StatusBar style="dark" />
      <ScreenHeader title="This week" subtitle={`${data.group.name} · ${money(data.potCents)} pot`} right={<IconButton icon="person-add-outline" label="Invite friends" onPress={() => void shareInvite(data)} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }} showsVerticalScrollIndicator={false}>
        <View style={styles.board}>
          {data.standings.map(s => {
            const mine = s.member.id === data.meId;
            return (
              <View key={s.member.id} style={styles.row}>
                <Text variant="title" color={s.rank === 1 ? colors.leaf : colors.muted} style={styles.rank}>{s.rank}</Text>
                <Avatar member={s.member} size={30} ring={colors.card} />
                <Text variant={mine ? "bodyStrong" : "body"} style={styles.name}>{mine ? "You" : s.member.name}</Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${(s.completed / top) * 100}%`, backgroundColor: mine ? colors.leaf : colors.rule }]} />
                </View>
                <Text variant="title" style={styles.count}>{s.completed}</Text>
              </View>
            );
          })}
        </View>

        <PotStatus data={data} />

        {alone && (
          <View style={styles.invite}>
            <InviteCard data={data} title="Nobody to race yet" body={`Your group is just you. Send the link, and everyone who joins puts ${money(data.stakeCents)} into this week's pot.`} />
          </View>
        )}

        {days.length === 0 && (
          <View style={styles.empty}>
            <Text variant="bodyStrong">No postcards this week</Text>
            <Text variant="small" color={colors.muted}>Every landmark you stamp lands here, with the photo you took.</Text>
          </View>
        )}

        {days.map(day => (
          <View key={day.label}>
            <Text variant="label" color={colors.muted} style={styles.day}>{day.label}</Text>
            <View style={styles.grid}>
              {day.cards.map((card, i) => (
                <View key={card.id} style={[styles.cell, { width: column }]}>
                  <Postcard card={card} member={byId[card.memberId]} width={column} showStamp={false} style={{ transform: [{ rotate: `${i % 2 ? 1.2 : -1.2}deg` }] }} />
                  <Reactions card={card} meId={data.meId} onReact={reaction => void ante.react(card.id, reaction)} />
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </Paper>
  );
}

const styles = StyleSheet.create({
  board: { marginHorizontal: space.lg, marginTop: space.sm, paddingVertical: space.xs, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardEdge },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, minHeight: 46 },
  rank: { width: 18 },
  name: { width: 64 },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.paper, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  count: { width: 18, textAlign: "right" },
  invite: { marginTop: space.lg },
  empty: { marginHorizontal: space.lg, marginTop: space.lg, padding: space.lg, gap: 4, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.rule },
  day: { paddingHorizontal: space.lg, marginTop: space.lg, marginBottom: space.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md, paddingHorizontal: space.lg },
  cell: { gap: space.sm, marginBottom: space.xs },
});
