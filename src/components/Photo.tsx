import { Ionicons } from "@expo/vector-icons";
import { Image, StyleSheet, View, type ImageSourcePropType, type ImageStyle, type StyleProp } from "react-native";
import { colors } from "../theme/tokens";

export function Photo({ source, style, icon = "image-outline" }: { source: ImageSourcePropType | null; style: StyleProp<ImageStyle>; icon?: keyof typeof Ionicons.glyphMap }) {
  if (source) return <Image source={source} style={style} resizeMode="cover" accessibilityIgnoresInvertColors />;
  return (
    <View style={[style as object, styles.blank]}>
      <Ionicons name={icon} size={28} color={colors.muted} />
    </View>
  );
}

const styles = StyleSheet.create({ blank: { alignItems: "center", justifyContent: "center", backgroundColor: colors.cardEdge } });
