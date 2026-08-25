import { createContext, useContext, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import type { CategorySummary } from "@civicos/shared";
import { citizenColors, fontWeights, internalColors, radii, typeScale } from "./theme";

type ThemeName = "citizen" | "internal";
const ThemeContext = createContext<ThemeName>("citizen");

export function DesignSystemProvider({ children, theme }: { children: ReactNode; theme: ThemeName }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

function usePalette() {
  return useContext(ThemeContext) === "internal" ? internalColors : citizenColors;
}

export function ScreenHeader({ eyebrow, title, onBack }: { eyebrow?: string; title: string; onBack?: () => void }) {
  const palette = usePalette();
  return <View style={styles.header}>
    {onBack ? <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={8} onPress={onBack}><Text style={[styles.back, { color: palette.accentStrong }]}>‹ Back</Text></Pressable> : null}
    {eyebrow ? <Text style={[styles.eyebrow, { color: palette.accentStrong }]}>{eyebrow}</Text> : null}
    <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
  </View>;
}

export function PrimaryButton({ children, onPress, disabled = false }: { children: ReactNode; onPress: () => void; disabled?: boolean }) {
  const theme = useContext(ThemeContext);
  const palette = usePalette();
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.primaryButton, { backgroundColor: theme === "internal" ? palette.accent : palette.accent }, disabled && styles.disabled]}>
    <Text style={[styles.primaryLabel, { color: theme === "internal" ? palette.surface : palette.accentStrong }]}>{children}</Text>
  </Pressable>;
}

export function SecondaryButton({ children, onPress, disabled = false }: { children: ReactNode; onPress: () => void; disabled?: boolean }) {
  const palette = usePalette();
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.secondaryButton, { borderColor: palette.accentStrong }, disabled && styles.disabled]}>
    <Text style={[styles.secondaryLabel, { color: palette.accentStrong }]}>{children}</Text>
  </Pressable>;
}

type StatusTone = "success" | "warning" | "danger" | "info";

function statusTone(value: string): StatusTone {
  const normalized = value.toUpperCase();
  if (normalized.includes("ESCALAT") || normalized.includes("REWORK")) return "danger";
  if (normalized.includes("DUE") || normalized.includes("PENDING") || normalized.includes("CONFLICT")) return "warning";
  if (normalized.includes("CLOSED") || normalized.includes("COMPLETE") || normalized.includes("VALIDATED") || normalized.includes("FULFILLED")) return "success";
  return "info";
}

function sentenceCase(value: string): string {
  const text = value.replaceAll("_", " ").toLowerCase();
  return text ? `${text[0]?.toUpperCase()}${text.slice(1)}` : text;
}

export function StatusChip({ label, tone = statusTone(label) }: { label: string; tone?: StatusTone }) {
  const palette = usePalette();
  const pair = tone === "success" ? [palette.successBg, palette.successText] : tone === "warning" ? [palette.warningBg, palette.warningText] : tone === "danger" ? [palette.dangerBg, palette.dangerText] : [palette.infoBg, palette.infoText];
  return <Text style={[styles.chip, { backgroundColor: pair[0], color: pair[1] }]}>{sentenceCase(label)}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const palette = usePalette();
  return <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }, style]}>{children}</View>;
}

export function TicketCard({ id, referenceNumber, category, status, relativeDate, title, meta, onPress, action }: {
  id: string;
  referenceNumber?: string;
  category: string;
  status: string;
  relativeDate: string;
  title?: string;
  meta?: string;
  onPress?: () => void;
  action?: ReactNode;
}) {
  const palette = usePalette();
  const content = <>
    <View style={styles.ticketTop}><Text style={[styles.ticketId, { color: palette.accentStrong }]}>Ticket {referenceNumber ?? id.slice(0, 8)}</Text><StatusChip label={status} /></View>
    {title ? <Text style={[styles.ticketTitle, { color: palette.text }]}>{title}</Text> : null}
    <Text style={[styles.ticketMeta, { color: palette.textSecondary }]}>{category} · {relativeDate}</Text>
    {meta ? <Text style={[styles.ticketMeta, { color: palette.textSecondary }]}>{meta}</Text> : null}
  </>;
  if (onPress && action) return <Card><Pressable accessibilityRole="button" onPress={onPress} style={styles.ticketPressTarget}>{content}</Pressable>{action}</Card>;
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>{content}</Pressable> : <Card>{content}{action}</Card>;
}

export function NotificationRow({ icon, message, time, tone, onPress }: { icon: string; message: string; time: string; tone: StatusTone; onPress: () => void }) {
  const palette = usePalette();
  const pair = tone === "success" ? [palette.successBg, palette.successText] : tone === "warning" ? [palette.warningBg, palette.warningText] : tone === "danger" ? [palette.dangerBg, palette.dangerText] : [palette.infoBg, palette.infoText];
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.notificationRow, { backgroundColor: palette.surface, borderBottomColor: palette.border }]}>
    <View style={[styles.notificationIcon, { backgroundColor: pair[0] }]}><Text style={[styles.notificationIconText, { color: pair[1] }]}>{icon}</Text></View>
    <View style={styles.notificationCopy}><Text style={[styles.notificationMessage, { color: palette.text }]}>{message}</Text><Text style={[styles.notificationTime, { color: palette.textSecondary }]}>{time}</Text></View>
    <Text accessibilityElementsHidden style={[styles.notificationArrow, { color: palette.textSecondary }]}>›</Text>
  </Pressable>;
}

export function CategoryGrid({ categories, selectedId, onSelect }: { categories: CategorySummary[]; selectedId?: string; onSelect: (category: CategorySummary) => void }) {
  const palette = usePalette();
  return <View accessibilityLabel="Issue categories" style={styles.categoryGrid}>{categories.map((category) => {
    const selected = category.id === selectedId;
    return <Pressable accessibilityRole="button" accessibilityState={{ selected }} key={category.id} onPress={() => onSelect(category)} style={[styles.categoryTile, { backgroundColor: selected ? palette.accent : palette.surface, borderColor: selected ? palette.accentStrong : palette.border }]}>
      <View style={[styles.categoryIcon, { backgroundColor: palette.accent }]}><Text style={[styles.categoryIconText, { color: palette.accentStrong }]}>{category.name.slice(0, 1)}</Text></View>
      <Text style={[styles.categoryLabel, { color: palette.text }]}>{category.name}</Text>
    </Pressable>;
  })}</View>;
}

export type MobileTab = { id: string; label: string; icon: string };
export function MobileTabBar({ active, items, onSelect }: { active: string; items: MobileTab[]; onSelect: (id: string) => void }) {
  const palette = usePalette();
  return <View accessibilityRole="tablist" style={[styles.tabBar, { backgroundColor: palette.surface, borderColor: palette.border }]}>{items.map((item) => {
    const selected = active === item.id;
    return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} key={item.id} onPress={() => onSelect(item.id)} style={styles.tab}>
      <Text style={[styles.tabIcon, { color: selected ? palette.accentStrong : palette.textSecondary }]}>{item.icon}</Text>
      <Text style={[styles.tabLabel, { color: selected ? palette.accentStrong : palette.textSecondary }]}>{item.label}</Text>
    </Pressable>;
  })}</View>;
}

const styles = StyleSheet.create({
  header: { gap: 6, marginBottom: 18 },
  back: { fontSize: typeScale.body, fontWeight: fontWeights.medium, marginBottom: 8 },
  eyebrow: { fontSize: typeScale.caption, fontWeight: fontWeights.medium },
  title: { fontSize: typeScale.title, fontWeight: fontWeights.medium, lineHeight: 28 },
  primaryButton: { alignItems: "center", borderRadius: radii.card, minHeight: 48, paddingHorizontal: 20, paddingVertical: 14 },
  primaryLabel: { fontSize: typeScale.input, fontWeight: fontWeights.medium },
  secondaryButton: { alignItems: "center", borderRadius: radii.card, borderWidth: 1, minHeight: 48, paddingHorizontal: 20, paddingVertical: 13 },
  secondaryLabel: { fontSize: typeScale.input, fontWeight: fontWeights.medium },
  disabled: { opacity: 0.45 },
  card: { borderRadius: radii.card, borderWidth: 1, gap: 10, padding: 18 },
  chip: { alignSelf: "flex-start", borderRadius: radii.chip, fontSize: typeScale.caption, fontWeight: fontWeights.medium, overflow: "hidden", paddingHorizontal: 10, paddingVertical: 5 },
  ticketTop: { alignItems: "flex-start", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  ticketId: { fontSize: typeScale.caption, fontWeight: fontWeights.medium },
  ticketTitle: { fontSize: typeScale.input, fontWeight: fontWeights.medium, lineHeight: 22 },
  ticketMeta: { fontSize: typeScale.body, lineHeight: 20 },
  ticketPressTarget: { gap: 10 },
  notificationRow: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", gap: 13, paddingHorizontal: 14, paddingVertical: 15 },
  notificationIcon: { alignItems: "center", borderRadius: radii.chip, height: 40, justifyContent: "center", width: 40 },
  notificationIconText: { fontSize: typeScale.section, fontWeight: fontWeights.medium },
  notificationCopy: { flex: 1, gap: 4 },
  notificationMessage: { fontSize: typeScale.body, fontWeight: fontWeights.medium, lineHeight: 20 },
  notificationTime: { fontSize: typeScale.caption },
  notificationArrow: { fontSize: 22 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  categoryTile: { borderRadius: radii.card, borderWidth: 1, gap: 10, minHeight: 118, padding: 16, width: "47%" },
  categoryIcon: { alignItems: "center", borderRadius: radii.chip, height: 40, justifyContent: "center", width: 40 },
  categoryIconText: { fontSize: typeScale.section, fontWeight: fontWeights.medium },
  categoryLabel: { fontSize: typeScale.input, fontWeight: fontWeights.medium },
  tabBar: { borderRadius: radii.card, borderWidth: 1, flexDirection: "row", padding: 4 },
  tab: { alignItems: "center", flex: 1, gap: 3, minHeight: 48, paddingHorizontal: 3, paddingVertical: 6 },
  tabIcon: { fontSize: typeScale.input },
  tabLabel: { fontSize: 11, fontWeight: fontWeights.medium },
});
