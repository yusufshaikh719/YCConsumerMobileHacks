import { StyleSheet } from "react-native";
import { fonts } from "../ui/fonts";

export const C = { bg: "#F4F3EF", card: "#FFFFFF", ink: "#0B1B3F", ink2: "#3A4766", muted: "#737A8C", faint: "#B4B8C2", line: "#E3E1DA", hair: "#ECEAE4", accent: "#FF4D2E", accentSoft: "#FFF0EC", accentTint: "#FFF6F3", green: "#13A05F", greenSoft: "#E7F6EE", white: "#FFFFFF" };
export const T = StyleSheet.create({ label: { fontFamily: fonts.condensed, fontSize: 12, letterSpacing: 1.6, color: C.muted }, title: { fontFamily: fonts.condensedHeavy, fontSize: 26, letterSpacing: 0.4, color: C.ink }, body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: C.ink2 }, small: { fontFamily: fonts.sans, fontSize: 13, color: C.muted } });
export const money = (cents: number) => `${cents < 0 ? "-" : ""}$${Math.abs(cents) % 100 ? (Math.abs(cents) / 100).toFixed(2) : Math.abs(cents) / 100}`;
