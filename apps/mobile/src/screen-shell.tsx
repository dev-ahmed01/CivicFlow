import type { ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "./theme";
import { responsiveMetrics } from "./responsive";

export function useResponsiveMetrics() {
  const { width, height, fontScale } = useWindowDimensions();
  return responsiveMetrics({ width, height, fontScale });
}

export function Shell({ children, includeBottom = false }: { children: ReactNode; includeBottom?: boolean }) {
  return <SafeAreaView edges={includeBottom ? ["top", "bottom", "left", "right"] : ["top", "left", "right"]} style={styles.safe}><View style={styles.shell}>{children}</View></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { backgroundColor: colors.canvas, flex: 1 }, shell: { flex: 1 } });
