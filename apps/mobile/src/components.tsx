import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CategorySummary } from "@civicos/shared";
import { citizenColors, fontWeights, internalColors, radii, typeScale } from "./theme";
import { useResponsiveMetrics } from "./screen-shell";

type ThemeName = "citizen" | "internal";
type IconName = ComponentProps<typeof Ionicons>["name"];
const ThemeContext = createContext<ThemeName>("citizen");

export function DesignSystemProvider({ children, theme }: { children: ReactNode; theme: ThemeName }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

function usePalette() {
  return useContext(ThemeContext) === "internal" ? internalColors : citizenColors;
}

export function AppIcon({ name, color, size = 20 }: { name: IconName; color?: string; size?: number }) {
  const palette = usePalette();
  return <Ionicons color={color ?? palette.accentStrong} name={name} size={size} />;
}

export function BrandLockup({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return <View style={styles.brand}>
    <View style={[styles.brandMark, light && styles.brandMarkLight]}><AppIcon color={light ? citizenColors.hero : citizenColors.surface} name="business" size={compact ? 16 : 19} /></View>
    <View><Text style={[styles.brandName, compact && styles.brandNameCompact, light && styles.brandNameLight]}>City Connect</Text>{compact ? null : <Text style={[styles.brandTagline, light && styles.brandTaglineLight]}>Your city, heard.</Text>}</View>
  </View>;
}

export function ScreenHeader({ eyebrow, title, subtitle, onBack, action }: { eyebrow?: string; title: string; subtitle?: string; onBack?: () => void; action?: ReactNode }) {
  const palette = usePalette();
  return <View style={styles.header}>
    <View style={styles.headerTop}>{onBack ? <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={10} onPress={onBack} style={styles.backButton}><AppIcon color={palette.accentStrong} name="chevron-back" size={20} /><Text style={[styles.back, { color: palette.accentStrong }]}>Back</Text></Pressable> : <View />}{action}</View>
    {eyebrow ? <Text style={[styles.eyebrow, { color: palette.accentStrong }]}>{eyebrow}</Text> : null}
    <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
    {subtitle ? <Text style={[styles.subtitle, { color: palette.textSecondary }]}>{subtitle}</Text> : null}
  </View>;
}

export function PrimaryButton({ children, onPress, disabled = false, icon }: { children: ReactNode; onPress: () => void; disabled?: boolean; icon?: IconName }) {
  const palette = usePalette();
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primaryButton, { backgroundColor: palette.accentStrong }, pressed && styles.pressed, disabled && styles.disabled]}>
    {icon ? <AppIcon color={palette.surface} name={icon} size={19} /> : null}<Text style={[styles.primaryLabel, { color: palette.surface }]}>{children}</Text>
  </Pressable>;
}

export function SecondaryButton({ children, onPress, disabled = false, icon }: { children: ReactNode; onPress: () => void; disabled?: boolean; icon?: IconName }) {
  const palette = usePalette();
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.secondaryButton, { backgroundColor: palette.surface, borderColor: palette.border }, pressed && styles.pressed, disabled && styles.disabled]}>
    {icon ? <AppIcon color={palette.accentStrong} name={icon} size={19} /> : null}<Text style={[styles.secondaryLabel, { color: palette.accentStrong }]}>{children}</Text>
  </Pressable>;
}

type StatusTone = "success" | "warning" | "danger" | "info";

function statusTone(value: string): StatusTone {
  const normalized = value.toUpperCase();
  if (normalized.includes("ESCALAT") || normalized.includes("REWORK") || normalized.includes("OVERDUE")) return "danger";
  if (normalized.includes("DUE") || normalized.includes("PENDING") || normalized.includes("WAIT") || normalized.includes("CONFLICT")) return "warning";
  if (normalized.includes("CLOSED") || normalized.includes("COMPLETE") || normalized.includes("VALIDATED") || normalized.includes("RESOLVED")) return "success";
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

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle | ViewStyle[] }) {
  const palette = usePalette();
  return <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }, style]}>{children}</View>;
}

export function TicketCard({ id, referenceNumber, category, status, relativeDate, title, meta, onPress, action }: {
  id: string; referenceNumber?: string; category: string; status: string; relativeDate: string; title?: string; meta?: string; onPress?: () => void; action?: ReactNode;
}) {
  const palette = usePalette();
  const content = <>
    <View style={styles.ticketTop}><Text style={[styles.ticketId, { color: palette.accentStrong }]}>Ticket {referenceNumber ?? id.slice(0, 8)}</Text><StatusChip label={status} /></View>
    {title ? <Text style={[styles.ticketTitle, { color: palette.text }]}>{title}</Text> : null}
    <Text style={[styles.ticketMeta, { color: palette.textSecondary }]}>{category} · {relativeDate}</Text>
    {meta ? <View style={styles.metaRow}><AppIcon color={palette.textSecondary} name="location-outline" size={15} /><Text numberOfLines={2} style={[styles.ticketMeta, styles.metaCopy, { color: palette.textSecondary }]}>{meta}</Text></View> : null}
  </>;
  if (onPress && action) return <Card><Pressable accessibilityRole="button" onPress={onPress} style={styles.ticketPressTarget}>{content}</Pressable>{action}</Card>;
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>{content}</Pressable> : <Card>{content}{action}</Card>;
}

export function NotificationRow({ icon, message, time, tone, onPress }: { icon: string; message: string; time: string; tone: StatusTone; onPress: () => void }) {
  const palette = usePalette();
  const pair = tone === "success" ? [palette.successBg, palette.successText] : tone === "warning" ? [palette.warningBg, palette.warningText] : tone === "danger" ? [palette.dangerBg, palette.dangerText] : [palette.infoBg, palette.infoText];
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.notificationRow, { backgroundColor: palette.surface, borderBottomColor: palette.border }, pressed && styles.pressed]}>
    <View style={[styles.notificationIcon, { backgroundColor: pair[0] }]}><Text style={[styles.notificationIconText, { color: pair[1] }]}>{icon}</Text></View>
    <View style={styles.notificationCopy}><Text style={[styles.notificationMessage, { color: palette.text }]}>{message}</Text><Text style={[styles.notificationTime, { color: palette.textSecondary }]}>{time}</Text></View>
    <AppIcon color={palette.textSecondary} name="chevron-forward" size={18} />
  </Pressable>;
}

function categoryIcon(name: string): IconName {
  const value = name.toLowerCase();
  if (value.includes("road") || value.includes("traffic")) return "car-sport-outline";
  if (value.includes("water") || value.includes("drain")) return "water-outline";
  if (value.includes("light") || value.includes("electrical")) return "flash-outline";
  if (value.includes("garbage") || value.includes("waste")) return "trash-outline";
  if (value.includes("park") || value.includes("tree")) return "leaf-outline";
  if (value.includes("animal")) return "paw-outline";
  if (value.includes("toilet")) return "business-outline";
  return "construct-outline";
}

export function CategoryGrid({ categories, selectedId, onSelect }: { categories: CategorySummary[]; selectedId?: string; onSelect: (category: CategorySummary) => void }) {
  const palette = usePalette();
  const { narrow } = useResponsiveMetrics();
  return <View accessibilityLabel="Issue categories" style={styles.categoryGrid}>{categories.map((category) => {
    const selected = category.id === selectedId;
    return <Pressable accessibilityRole="button" accessibilityState={{ selected }} key={category.id} onPress={() => onSelect(category)} style={({ pressed }) => [styles.categoryTile, narrow && styles.categoryTileNarrow, { backgroundColor: selected ? palette.accent : palette.surface, borderColor: selected ? palette.accentStrong : palette.border }, pressed && styles.pressed]}>
      <View style={[styles.categoryIcon, { backgroundColor: selected ? palette.surface : palette.accent }]}><AppIcon color={palette.accentStrong} name={categoryIcon(category.name)} size={21} /></View>
      <Text style={[styles.categoryLabel, { color: palette.text }]}>{category.name}</Text>
      {selected ? <AppIcon color={palette.accentStrong} name="checkmark-circle" size={19} /> : null}
    </Pressable>;
  })}</View>;
}

export type MobileTab = { id: string; label: string; icon: IconName; activeIcon?: IconName; badge?: number };
export function MobileTabBar({ active, items, onSelect }: { active: string; items: MobileTab[]; onSelect: (id: string) => void }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  return <View accessibilityRole="tablist" style={[styles.tabBar, { backgroundColor: palette.surface, borderTopColor: palette.border, paddingBottom: Math.max(insets.bottom, 6) }]}>{items.map((item) => {
    const selected = active === item.id;
    return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} key={item.id} onPress={() => onSelect(item.id)} style={styles.tab}>
      <View><AppIcon color={selected ? palette.accentStrong : palette.textSecondary} name={selected ? item.activeIcon ?? item.icon : item.icon} size={22} />{item.badge ? <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{item.badge > 9 ? "9+" : item.badge}</Text></View> : null}</View>
      <Text numberOfLines={2} style={[styles.tabLabel, { color: selected ? palette.accentStrong : palette.textSecondary }]}>{item.label}</Text>
    </Pressable>;
  })}</View>;
}

const styles = StyleSheet.create({
  brand: { alignItems: "center", flexDirection: "row", gap: 11 }, brandMark: { alignItems: "center", backgroundColor: citizenColors.accentStrong, borderRadius: 12, height: 42, justifyContent: "center", width: 42 }, brandMarkLight: { backgroundColor: citizenColors.lime },
  brandName: { color: citizenColors.text, fontSize: 20, fontWeight: "700", letterSpacing: -0.5 }, brandNameCompact: { fontSize: 18 }, brandNameLight: { color: citizenColors.surface }, brandTagline: { color: citizenColors.textSecondary, fontSize: 11, marginTop: 1 }, brandTaglineLight: { color: citizenColors.heroMuted },
  header: { gap: 6, marginBottom: 8, minWidth: 0 }, headerTop: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", minHeight: 34 }, backButton: { alignItems: "center", flexDirection: "row", marginBottom: 6, marginLeft: -5, minHeight: 36 }, back: { fontSize: typeScale.body, fontWeight: fontWeights.semibold },
  eyebrow: { fontSize: typeScale.caption, fontWeight: fontWeights.semibold, letterSpacing: 0.5, textTransform: "uppercase" }, title: { fontSize: typeScale.title, fontWeight: fontWeights.bold, letterSpacing: -0.7, lineHeight: 31 }, subtitle: { fontSize: typeScale.body, lineHeight: 21, marginTop: 2 },
  primaryButton: { alignItems: "center", borderRadius: radii.button, flexDirection: "row", flexShrink: 1, gap: 9, justifyContent: "center", minHeight: 52, minWidth: 0, paddingHorizontal: 20, paddingVertical: 14 }, primaryLabel: { flexShrink: 1, fontSize: typeScale.input, fontWeight: fontWeights.semibold, textAlign: "center" }, secondaryButton: { alignItems: "center", borderRadius: radii.button, borderWidth: 1, flexDirection: "row", flexShrink: 1, gap: 9, justifyContent: "center", minHeight: 50, minWidth: 0, paddingHorizontal: 18, paddingVertical: 13 }, secondaryLabel: { flexShrink: 1, fontSize: typeScale.body, fontWeight: fontWeights.semibold, textAlign: "center" }, pressed: { opacity: 0.78 }, disabled: { opacity: 0.45 },
  card: { borderRadius: radii.card, borderWidth: 1, gap: 10, padding: 16 }, chip: { alignSelf: "flex-start", borderRadius: radii.chip, fontSize: typeScale.caption, fontWeight: fontWeights.semibold, overflow: "hidden", paddingHorizontal: 8, paddingVertical: 5 },
  ticketTop: { alignItems: "flex-start", flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" }, ticketId: { flexShrink: 1, fontSize: typeScale.caption, fontWeight: fontWeights.semibold }, ticketTitle: { fontSize: typeScale.input, fontWeight: fontWeights.semibold, lineHeight: 22 }, ticketMeta: { fontSize: typeScale.body, lineHeight: 20 }, metaRow: { alignItems: "flex-start", flexDirection: "row", gap: 6 }, metaCopy: { flex: 1 }, ticketPressTarget: { gap: 10 },
  notificationRow: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", gap: 13, minHeight: 72, paddingHorizontal: 14, paddingVertical: 13 }, notificationIcon: { alignItems: "center", borderRadius: 21, height: 42, justifyContent: "center", width: 42 }, notificationIconText: { fontSize: typeScale.section, fontWeight: fontWeights.semibold }, notificationCopy: { flex: 1, gap: 4 }, notificationMessage: { fontSize: typeScale.body, fontWeight: fontWeights.semibold, lineHeight: 20 }, notificationTime: { fontSize: typeScale.caption },
  categoryGrid: { gap: 8 }, categoryTile: { alignItems: "center", borderRadius: radii.card, borderWidth: 1, flexDirection: "row", gap: 12, minHeight: 64, paddingHorizontal: 14, paddingVertical: 11, width: "100%" }, categoryTileNarrow: { width: "100%" }, categoryIcon: { alignItems: "center", borderRadius: 6, height: 36, justifyContent: "center", width: 36 }, categoryLabel: { flex: 1, fontSize: typeScale.body, fontWeight: fontWeights.semibold, lineHeight: 19 },
  tabBar: { borderTopWidth: 1, flexDirection: "row", minHeight: 66, paddingHorizontal: 4, paddingTop: 7 }, tab: { alignItems: "center", flex: 1, gap: 3, minHeight: 52, minWidth: 0, paddingHorizontal: 2, paddingVertical: 3 }, tabLabel: { fontSize: 10, fontWeight: fontWeights.semibold, lineHeight: 13, minHeight: 13, textAlign: "center" }, tabBadge: { alignItems: "center", backgroundColor: citizenColors.dangerText, borderColor: citizenColors.surface, borderRadius: 8, borderWidth: 1.5, height: 17, justifyContent: "center", minWidth: 17, paddingHorizontal: 3, position: "absolute", right: -9, top: -5 }, tabBadgeText: { color: citizenColors.surface, fontSize: 9, fontWeight: "700" },
});
