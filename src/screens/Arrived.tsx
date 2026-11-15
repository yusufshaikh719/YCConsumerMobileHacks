import { CameraView, useCameraPermissions } from "expo-camera";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Linking, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Paper } from "../components/Paper";
import { devToolsEnabled } from "../dev/enabled";
import { haptic } from "../lib/haptics";
import { formatMinSec } from "../lib/time";
import { useNow } from "../lib/useNow";
import type { Sidequest } from "../services/types";
import { useAnte } from "../state/AnteProvider";
import { useReducedMotion } from "../theme/motion";
import { Text } from "../theme/Text";
import { colors, radius, space, touch } from "../theme/tokens";

const INTRO_MS = 1300;

export function Arrived({ quest }: { quest: Sidequest }) {
  const { dispatch } = useAnte();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const now = useNow(1000);
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [intro, setIntro] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reveal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    haptic.success();
    const timer = setTimeout(() => {
      setIntro(false);
      Animated.timing(reveal, { toValue: 1, duration: reduced ? 0 : 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }, reduced ? 600 : INTRO_MS);
    return () => clearTimeout(timer);
  }, [reveal, reduced]);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  const capture = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    haptic.slam();
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 0.7, skipProcessing: false });
      if (!photo?.uri) throw new Error("No photo");
      dispatch({ type: "CAPTURE", photoUri: photo.uri });
    } catch {
      if (devToolsEnabled) dispatch({ type: "CAPTURE", photoUri: null });
      else {
        setError("That didn't take. Hold still and try again.");
        setBusy(false);
      }
    }
  };

  if (intro) {
    return (
      <Paper tone="moss" style={styles.intro}>
        <StatusBar style="light" />
        <Text variant="label" color={colors.sprout}>You made it</Text>
        <Text variant="hero" color={colors.onMoss} align="center" style={styles.introTitle}>{quest.landmark.name}</Text>
        <Text variant="body" color={colors.onMossMuted}>Selfie time.</Text>
      </Paper>
    );
  }

  const denied = permission && !permission.granted && !permission.canAskAgain;
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {permission?.granted && <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="front" mirror animateShutter={false} />}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: reveal }]}>
        <View style={[styles.topShade, { paddingTop: insets.top + space.sm }]}>
          <View style={styles.hintRow}>
            <Text variant="label" color={colors.sprout}>{formatMinSec(quest.expiresAt - now)} left</Text>
          </View>
          <Text variant="display" color={colors.white} align="center" style={styles.hint}>Get {quest.landmark.name} behind you.</Text>
        </View>

        <View style={styles.middle}>
          {denied ? (
            <View style={styles.permission}>
              <Text variant="heading">Camera is off</Text>
              <Text variant="body" color={colors.inkSoft}>Ante needs the front camera for your sidequest selfie. Photos are taken in the app only.</Text>
              <Pressable onPress={() => void Linking.openSettings()} style={styles.settings}>
                <Text variant="bodyStrong" color={colors.white}>Open Settings</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.frame} pointerEvents="none">
              <View style={[styles.corner, styles.tl]} />
              <View style={[styles.corner, styles.tr]} />
              <View style={[styles.corner, styles.bl]} />
              <View style={[styles.corner, styles.br]} />
            </View>
          )}
        </View>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]}>
          {error && <Text variant="small" color={colors.white} align="center">{error}</Text>}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take selfie"
            disabled={busy || !!denied}
            onPress={() => void capture()}
            style={({ pressed }) => [styles.shutter, (pressed || busy) && styles.shutterPressed]}
          >
            <View style={styles.shutterCore} />
          </Pressable>
          <Text variant="small" color="rgba(255,255,255,0.8)" align="center">In-app camera only · no gallery</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const corner = 34;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.mossDeep },
  intro: { alignItems: "center", justifyContent: "center", gap: space.sm, paddingHorizontal: space.lg },
  introTitle: { marginVertical: space.xs },
  topShade: { paddingHorizontal: space.lg, paddingBottom: space.lg, backgroundColor: "rgba(15,46,30,0.72)", gap: space.xs },
  hintRow: { alignItems: "center" },
  hint: { fontSize: 38, lineHeight: 40 },
  middle: { flex: 1, padding: space.xl, justifyContent: "center" },
  frame: { flex: 1, maxHeight: 420 },
  corner: { position: "absolute", width: corner, height: corner, borderColor: colors.sprout },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 10 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 10 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 10 },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 10 },
  permission: { backgroundColor: colors.paper, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  settings: { minHeight: touch.min, borderRadius: radius.pill, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", marginTop: space.xs },
  bottom: { alignItems: "center", gap: space.sm, paddingTop: space.md, backgroundColor: "rgba(15,46,30,0.55)" },
  shutter: { width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: colors.white, alignItems: "center", justifyContent: "center" },
  shutterPressed: { opacity: 0.6, transform: [{ scale: 0.94 }] },
  shutterCore: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.sprout },
});
