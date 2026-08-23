import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "./theme";

export function ScreenHeader({ eyebrow, title, onBack }: { eyebrow?: string; title: string; onBack?: () => void }) {
  return <View style={styles.header}>
    {onBack ? <Pressable accessibilityRole="button" onPress={onBack}><Text style={styles.back}>‹ Back</Text></Pressable> : null}
    {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
    <Text style={styles.title}>{title}</Text>
  </View>;
}

export function PrimaryButton({ children, onPress, disabled = false }: { children: ReactNode; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.primaryButton, disabled && styles.disabled]}>
    <Text style={styles.primaryLabel}>{children}</Text>
  </Pressable>;
}

export function SecondaryButton({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.secondaryButton}>
    <Text style={styles.secondaryLabel}>{children}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  header: { gap: 6, marginBottom: 24 },
  back: { color: colors.primary, fontSize: 16, fontWeight: "700", marginBottom: 10 },
  eyebrow: { color: colors.primary, fontSize: 13, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  title: { color: colors.ink, fontSize: 30, fontWeight: "800", letterSpacing: -0.6 },
  primaryButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 16 },
  primaryLabel: { color: colors.surface, fontSize: 17, fontWeight: "800" },
  secondaryButton: { alignItems: "center", borderColor: colors.primary, borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 20, paddingVertical: 15 },
  secondaryLabel: { color: colors.primary, fontSize: 16, fontWeight: "800" },
  disabled: { opacity: 0.45 },
});
