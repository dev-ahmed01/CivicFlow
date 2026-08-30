// Part II §1.2 — presentation tokens. Raw color values live in this file only.
export const citizenColors = {
  bg: "#F4F7F3", surface: "#FFFFFF", surfaceAlt: "#EDF3ED", accent: "#DDF2E3", accentStrong: "#1F7A3C", lime: "#7ED321", hero: "#0A2415", heroAlt: "#123A22", heroMuted: "#CFE8D8",
  border: "#E2E9E2", text: "#142018", textSecondary: "#5B675F", successBg: "#E4F1E7", successText: "#1F5A34", warningBg: "#FBF1DE", warningText: "#8A6416", dangerBg: "#FBEAEA", dangerText: "#9C3B3B", infoBg: "#E7F0F7", infoText: "#2C5C82", overlay: "rgba(10, 36, 21, 0.48)",
} as const;

export const internalColors = {
  ...citizenColors, bg: "#F5F7F5", surfaceAlt: "#F0F3F0", accent: "#DDE9E0", accentStrong: "#1F5A34", border: "#DFE4DF", text: "#111713", textSecondary: "#5F685F",
} as const;

export const colors = { ...citizenColors, canvas: citizenColors.bg, primary: citizenColors.accentStrong, primarySoft: citizenColors.accent, ink: citizenColors.text, muted: citizenColors.textSecondary, danger: citizenColors.dangerText } as const;
export const internal = { ...internalColors, canvas: internalColors.bg, primary: internalColors.accentStrong, primarySoft: internalColors.accent, ink: internalColors.text, muted: internalColors.textSecondary, danger: internalColors.dangerText } as const;
export const typeScale = { caption: 12, body: 14, input: 16, section: 19, title: 25, display: 32 } as const;
export const fontWeights = { regular: "400", medium: "500", semibold: "600", bold: "700" } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = { card: 10, button: 8, chip: 5 } as const;
