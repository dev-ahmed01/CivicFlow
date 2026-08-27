import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "./theme";

export function Shell({ children }: { children: ReactNode }) {
  return <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}><View style={styles.shell}>{children}</View></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { backgroundColor: colors.canvas, flex: 1 }, shell: { flex: 1 } });
