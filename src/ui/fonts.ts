import { BarlowCondensed_500Medium, BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold } from "@expo-google-fonts/barlow-condensed";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from "@expo-google-fonts/inter";
import { createContext, createElement, useContext } from "react";
import { StyleSheet, Text, type TextProps } from "react-native";

export const FONT_ASSETS = { BarlowCondensed_500Medium, BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold };
export const fonts = { condensed: "BarlowCondensed_700Bold", condensedMedium: "BarlowCondensed_500Medium", condensedHeavy: "BarlowCondensed_800ExtraBold", sans: "Inter_400Regular", sansMedium: "Inter_500Medium", sansSemi: "Inter_600SemiBold", sansBold: "Inter_700Bold", sansHeavy: "Inter_800ExtraBold" };
export const FontLoadedContext = createContext(false);
export function AppText({ style, ...props }: TextProps) {
  const loaded = useContext(FontLoadedContext);
  const family = StyleSheet.flatten(style)?.fontFamily;
  return createElement(Text, { ...props, style: !loaded && family && Object.values(fonts).includes(family) ? [style, { fontFamily: undefined }] : style });
}
