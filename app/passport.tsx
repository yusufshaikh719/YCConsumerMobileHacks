import { StatusBar } from "expo-status-bar";
import { ScrollView, StyleSheet, View } from "react-native";
import { Photo } from "../src/components/Photo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { Paper } from "../src/components/Paper";
import { Postmark } from "../src/components/Postmark";
import { ScreenHeader } from "../src/components/ScreenHeader";
import { formatTimeOfDay, isSameDay, weekdayShort } from "../src/lib/time";
import { useAnte } from "../src/state/AnteProvider";
import { Text } from "../src/theme/Text";
import { colors, radius, space } from "../src/theme/tokens";

const INKS = [colors.leaf, colors.moss, "#3C6E9E", colors.leaf, "#8A6D2F", colors.moss, colors.leaf];
const TILTS = [-10, 7, -4, 12, -8, 5, -13];

export default function Passport() {
  const { data } = useAnte();
  const insets = useSafeAreaInsets();
  const me = data.group.members.find(m => m.id === data.meId);
  const mine = data.postcards.filter(p => p.memberId === data.meId);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => today.getTime() - (6 - i) * 86_400_000);
  const minutes = mine.reduce((sum, p) => sum + p.minutesTaken, 0);
  const first = new Date(days[0]).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const last = new Date(days[6]).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <Paper style={{ paddingTop: insets.top }}>
      <StatusBar style="dark" />
      <ScreenHeader title="Passport" subtitle={`${first} – ${last}`} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }} showsVerticalScrollIndicator={false}>
        <View style={styles.page}>
          <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 140" preserveAspectRatio="none" pointerEvents="none">
            {Array.from({ length: 9 }, (_, i) => (
              <Path key={i} d={`M0 ${20 + i * 14} C 25 ${12 + i * 14}, 75 ${28 + i * 14}, 100 ${20 + i * 14}`} stroke={colors.leaf} strokeOpacity={0.07} strokeWidth={0.4} fill="none" />
            ))}
          </Svg>
          <View style={styles.identity}>
            <View>
              <Text variant="label" color={colors.muted}>Holder</Text>
              <Text variant="heading">{me?.fullName ?? "You"}</Text>
              <Text variant="small" color={colors.muted}>{data.group.name}</Text>
            </View>
            <View style={styles.totals}>
              <Text variant="hero" color={colors.leaf} style={styles.total}>{mine.length}</Text>
              <Text variant="label" color={colors.muted}>Stamps</Text>
            </View>
          </View>
          <View style={styles.rule} />
          <View style={styles.grid}>
            {days.map((day, i) => {
              const card = mine.find(p => isSameDay(p.completedAt, day));
              return (
                <View key={day} style={styles.slot}>
                  {card ? (
                    <View style={styles.stampWrap}>
                      <Photo source={card.photo} style={styles.thumb} />
                      <View style={styles.overThumb}>
                        <Postmark size={104} top={card.landmark.name.toUpperCase()} middle={formatTimeOfDay(card.completedAt).replace(" ", "")} bottom={`${weekdayShort(day).toUpperCase()} · ${card.minutesTaken} MIN`} color={INKS[i]} rotate={TILTS[i]} fill="rgba(251,249,242,0.82)" />
                      </View>
                    </View>
                  ) : (
                    <Svg width={120} height={112}>
                      <Circle cx={60} cy={56} r={44} stroke={colors.rule} strokeWidth={1.5} strokeDasharray="4 6" fill="none" />
                    </Svg>
                  )}
                  <Text variant="label" color={card ? colors.ink : colors.muted} style={styles.dayLabel}>
                    {isSameDay(day, Date.now()) ? "Today" : weekdayShort(day)}
                  </Text>
                </View>
              );
            })}
          </View>
          <View style={styles.rule} />
          <Text variant="small" color={colors.inkSoft} align="center">{mine.length ? `${minutes} minutes walked to ${mine.length} ${mine.length === 1 ? "landmark" : "landmarks"} this week.` : "No stamps yet. Your first sidequest fills the first circle."}</Text>
        </View>
      </ScrollView>
    </Paper>
  );
}

const styles = StyleSheet.create({
  page: { margin: space.lg, marginTop: space.sm, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge, overflow: "hidden", gap: space.md },
  identity: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  totals: { alignItems: "flex-end" },
  total: { fontSize: 64, lineHeight: 64 },
  rule: { height: 1, backgroundColor: colors.cardEdge },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: space.lg },
  slot: { width: "48%", alignItems: "center", gap: space.xs },
  stampWrap: { width: 120, height: 112, alignItems: "center", justifyContent: "center" },
  thumb: { position: "absolute", width: 70, height: 88, borderRadius: 3, top: 0, left: 4, transform: [{ rotate: "-4deg" }], opacity: 0.9 },
  overThumb: { position: "absolute", right: 0, bottom: 0 },
  dayLabel: { marginTop: 2 },
});
