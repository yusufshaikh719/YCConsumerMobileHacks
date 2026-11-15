import { Image, StyleSheet, View, type ViewStyle } from "react-native";
import { formatTimeOfDay, weekdayShort } from "../lib/time";
import type { Member, Postcard as PostcardData } from "../services/types";
import { Text } from "../theme/Text";
import { colors, radius, space } from "../theme/tokens";
import { Perforation } from "./Perforation";
import { Postmark } from "./Postmark";

type Props = { card: PostcardData; member?: Member; width: number; background?: string; style?: ViewStyle; showStamp?: boolean };

export function Postcard({ card, member, width, background = colors.paper, style, showStamp = true }: Props) {
  const pad = Math.max(6, width * 0.045);
  const photoHeight = (width - pad * 2) * 1.12;
  const compact = width < 170;
  return (
    <View style={[styles.card, { width, padding: pad }, style]} accessibilityLabel={`${member ? member.name + " at " : ""}${card.landmark.name}`}>
      <Image source={card.photo} style={[styles.photo, { height: photoHeight }]} resizeMode="cover" />
      <View style={[styles.caption, { paddingTop: pad * 0.9 }]}>
        <Text variant={compact ? "small" : "bodyStrong"} numberOfLines={1} style={compact && styles.compactTitle}>{card.landmark.name}</Text>
        <Text variant="small" color={colors.muted} numberOfLines={1} style={compact && styles.compactMeta}>
          {member ? `${member.name} · ` : ""}{card.minutesTaken} min
        </Text>
      </View>
      {showStamp && (
        <View style={[styles.stamp, { top: photoHeight - width * 0.18, right: pad * 0.6 }]}>
          <Postmark size={width * 0.34} top={weekdayShort(card.completedAt).toUpperCase()} middle={formatTimeOfDay(card.completedAt).replace(" ", "")} bottom="ANTE" color={colors.leaf} />
        </View>
      )}
      <Perforation color={background} edge="top" count={Math.round(width / 14)} size={Math.max(5, width * 0.035)} />
      <Perforation color={background} edge="bottom" count={Math.round(width / 14)} size={Math.max(5, width * 0.035)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    shadowColor: "#3B3424",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  photo: { width: "100%", borderRadius: 3, backgroundColor: colors.cardEdge },
  caption: { gap: 1 },
  compactTitle: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 16 },
  compactMeta: { fontSize: 11, lineHeight: 14 },
  stamp: { position: "absolute" },
});
