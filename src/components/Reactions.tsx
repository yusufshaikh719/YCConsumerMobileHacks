import { Pressable, StyleSheet, View } from "react-native";
import { haptic } from "../lib/haptics";
import { REACTIONS, type Postcard, type Reaction } from "../services/types";
import { Text } from "../theme/Text";
import { colors, radius } from "../theme/tokens";

export function Reactions({ card, meId, onReact }: { card: Postcard; meId: string; onReact: (reaction: Reaction) => void }) {
  return (
    <View style={styles.row}>
      {REACTIONS.map(reaction => {
        const who = card.reactions[reaction];
        const mine = who.includes(meId);
        return (
          <Pressable
            key={reaction}
            accessibilityRole="button"
            accessibilityState={{ selected: mine }}
            accessibilityLabel={`React ${reaction}, ${who.length}`}
            hitSlop={4}
            onPress={() => {
              haptic.select();
              onReact(reaction);
            }}
            style={[styles.chip, mine && styles.mine]}
          >
            <Text style={styles.emoji}>{reaction}</Text>
            {who.length > 0 && <Text variant="small" color={mine ? colors.leaf : colors.inkSoft} style={styles.count}>{who.length}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 3 },
  chip: { flex: 1, flexDirection: "row", alignItems: "center", gap: 1, minHeight: 36, paddingHorizontal: 2, justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardEdge },
  mine: { borderColor: colors.leaf, backgroundColor: colors.leafSoft },
  emoji: { fontSize: 13, lineHeight: 18 },
  count: { fontSize: 11, lineHeight: 16 },
});
