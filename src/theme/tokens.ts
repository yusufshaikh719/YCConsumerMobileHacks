export const colors = {
  paper: "#F3EFE4",
  card: "#FBF9F2",
  cardEdge: "#E4DDCB",
  rule: "#DCD5C2",
  ink: "#1D1F1A",
  inkSoft: "#4A4D43",
  muted: "#7F8275",
  leaf: "#2FA052",
  leafSoft: "#DCEBD8",
  moss: "#17402A",
  mossDeep: "#0F2E1E",
  mossLine: "#2C5A40",
  sprout: "#8BD98F",
  onMoss: "#F3EFE4",
  onMossMuted: "#B4CBB6",
  warn: "#C9772E",
  white: "#FFFFFF",
} as const;

export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 6, md: 12, lg: 20, pill: 999 } as const;

export const touch = { min: 48, large: 60 } as const;

export const fontFamily = {
  display: "BebasNeue_400Regular",
  body: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

export const type = {
  scoreboard: { fontFamily: fontFamily.display, fontSize: 168, lineHeight: 168, letterSpacing: 1 },
  hero: { fontFamily: fontFamily.display, fontSize: 72, lineHeight: 72, letterSpacing: 1 },
  display: { fontFamily: fontFamily.display, fontSize: 44, lineHeight: 46, letterSpacing: 0.5 },
  title: { fontFamily: fontFamily.display, fontSize: 30, lineHeight: 32, letterSpacing: 0.5 },
  heading: { fontFamily: fontFamily.bold, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: fontFamily.body, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 23 },
  small: { fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 19 },
  label: { fontFamily: fontFamily.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 1.4, textTransform: "uppercase" },
} as const;

export type TypeVariant = keyof typeof type;
