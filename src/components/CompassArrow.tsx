import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useReducedMotion } from "../theme/motion";
import { colors } from "../theme/tokens";

export function CompassArrow({ size, rotation }: { size: number; rotation: number }) {
  const reduced = useReducedMotion();
  const angle = useRef(new Animated.Value(rotation)).current;
  const current = useRef(rotation);
  useEffect(() => {
    const delta = ((((rotation - current.current) % 360) + 540) % 360) - 180;
    current.current += delta;
    Animated.timing(angle, { toValue: current.current, duration: reduced ? 0 : 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [rotation, reduced, angle]);
  const spin = angle.interpolate({ inputRange: [-3600, 3600], outputRange: ["-3600deg", "3600deg"] });
  return (
    <Animated.View accessibilityLabel="Direction to the landmark" style={{ width: size, height: size, transform: [{ rotate: spin }] }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Path d="M50 6 L80 82 L50 66 L20 82 Z" fill={colors.sprout} />
        <Path d="M50 6 L50 66 L20 82 Z" fill={colors.leaf} />
      </Svg>
    </Animated.View>
  );
}
