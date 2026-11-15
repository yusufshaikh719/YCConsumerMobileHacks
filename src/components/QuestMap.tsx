import { useState } from "react";
import { Image, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import type { LatLng } from "../services/types";
import { Text } from "../theme/Text";
import { colors, radius } from "../theme/tokens";

const TILE = 256;

function project({ lat, lng }: LatLng, zoom: number) {
  const scale = TILE * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale };
}

export function QuestMap({ you, target }: { you: LatLng; target: LatLng }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const span = project(you, 0);
  const spanB = project(target, 0);
  const worldSpan = Math.max(Math.abs(span.x - spanB.x) / Math.max(1, box.w), Math.abs(span.y - spanB.y) / Math.max(1, box.h), 1e-9);
  const zoom = Math.max(12, Math.min(17, Math.floor(Math.log2(0.6 / worldSpan))));
  const a = project(you, zoom);
  const b = project(target, zoom);
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const origin = { x: center.x - box.w / 2, y: center.y - box.h / 2 };
  const tiles: { x: number; y: number }[] = [];
  if (box.w > 0) {
    for (let tx = Math.floor(origin.x / TILE); tx <= Math.floor((origin.x + box.w) / TILE); tx++) {
      for (let ty = Math.floor(origin.y / TILE); ty <= Math.floor((origin.y + box.h) / TILE); ty++) tiles.push({ x: tx, y: ty });
    }
  }
  const pa = { x: a.x - origin.x, y: a.y - origin.y };
  const pb = { x: b.x - origin.x, y: b.y - origin.y };
  return (
    <View style={styles.frame} onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {tiles.map(t => (
        <Image
          key={`${t.x}-${t.y}`}
          source={{ uri: `https://tile.openstreetmap.org/${zoom}/${t.x}/${t.y}.png`, headers: { "User-Agent": "Ante/1.0 (hackathon demo; github.com/yusufshaikh719/ycconsumermobilehacks)" } }}
          style={{ position: "absolute", left: t.x * TILE - origin.x, top: t.y * TILE - origin.y, width: TILE, height: TILE }}
        />
      ))}
      <Svg width={box.w} height={box.h} style={styles.overlay}>
        <Line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={colors.moss} strokeWidth={4} strokeDasharray="2 9" strokeLinecap="round" />
        <Circle cx={pb.x} cy={pb.y} r={16} fill={colors.leaf} opacity={0.25} />
        <Circle cx={pb.x} cy={pb.y} r={8} fill={colors.leaf} stroke={colors.white} strokeWidth={3} />
        <Circle cx={pa.x} cy={pa.y} r={9} fill={colors.ink} stroke={colors.white} strokeWidth={3} />
      </Svg>
      <Text variant="small" color={colors.inkSoft} style={styles.credit}>© OpenStreetMap contributors</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, overflow: "hidden", borderRadius: radius.lg, backgroundColor: colors.card },
  overlay: { position: "absolute", top: 0, left: 0 },
  credit: { position: "absolute", right: 8, bottom: 6, fontSize: 10, backgroundColor: "rgba(251,249,242,0.85)", paddingHorizontal: 4, borderRadius: 4 },
});
