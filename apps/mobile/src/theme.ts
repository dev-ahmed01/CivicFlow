// Part II §1.2 — presentation tokens. Raw color values live in this file only.
export const citizenColors = {
  bg: "#FFFDF7",
  surface: "#FFFFFF",
  surfaceAlt: "#F5F3E8",
  accent: "#C9EBD4",
  accentStrong: "#1F7A44",
  border: "#E8E3D3",
  text: "#141614",
  textSecondary: "#5B5F58",
  successBg: "#E4F1E7",
  successText: "#1F5A34",
  warningBg: "#FBF1DE",
  warningText: "#8A6416",
  dangerBg: "#FBEAEA",
  dangerText: "#9C3B3B",
  infoBg: "#E7F0F7",
  infoText: "#2C5C82",
  overlay: "rgba(20, 22, 20, 0.45)",
} as const;

export const internalColors = {
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceAlt: "#F6F6F6",
  accent: "#1F5A34",
  accentStrong: "#1F5A34",
  border: "#E2E2E2",
  text: "#111111",
  textSecondary: "#5F5F5F",
  successBg: "#E4F1E7",
  successText: "#1F5A34",
  warningBg: "#FBF1DE",
  warningText: "#8A6416",
  dangerBg: "#FBEAEA",
  dangerText: "#9C3B3B",
  infoBg: "#E7F0F7",
  infoText: "#2C5C82",
  overlay: "rgba(17, 17, 17, 0.45)",
} as const;

// Citizen aliases keep the reporting flow readable.
export const colors = {
  ...citizenColors,
  canvas: citizenColors.bg,
  primary: citizenColors.accentStrong,
  primarySoft: citizenColors.accent,
  ink: citizenColors.text,
  muted: citizenColors.textSecondary,
  danger: citizenColors.dangerText,
} as const;

export const internal = {
  ...internalColors,
  canvas: internalColors.bg,
  primary: internalColors.accent,
  primarySoft: internalColors.surfaceAlt,
  ink: internalColors.text,
  muted: internalColors.textSecondary,
  danger: internalColors.dangerText,
} as const;

export const typeScale = { caption: 12, body: 14, input: 16, section: 18, title: 22 } as const;
export const fontWeights = { regular: "400", medium: "500" } as const;
export const radii = { card: 12, chip: 20 } as const;
