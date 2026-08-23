import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  notificationDayGroup,
  notificationPresentation,
  relativeNotificationTime,
  type UserRole,
} from "@civicos/shared";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { loadNotifications, markNotificationRead, type MobileNotification } from "./api";
import { clearAppBadge } from "./push-notifications";
import { Shell } from "./screens";
import { colors } from "./theme";
import { NotificationRow } from "./components";

type GroupRow = { kind: "heading"; id: string; label: string } | { kind: "notification"; id: string; notification: MobileNotification };

export function NotificationsScreen({ role, onBack, onOpen, onViewed }: {
  role: UserRole;
  onBack: () => void;
  onOpen: (notification: MobileNotification) => void;
  onViewed: () => void;
}) {
  const [notifications, setNotifications] = useState<MobileNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const onViewedRef = useRef(onViewed);
  useEffect(() => { onViewedRef.current = onViewed; }, [onViewed]);

  const refresh = useCallback(async () => {
    setError(undefined);
    try {
      const result = await loadNotifications();
      setNotifications(result.notifications.map((item) => ({ ...item, read: true })));
      await Promise.all(result.notifications.filter((item) => !item.read).map((item) => markNotificationRead(item.id)));
      await clearAppBadge();
      onViewedRef.current();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load notifications");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const rows = useMemo<GroupRow[]>(() => (["Today", "Yesterday", "Earlier"] as const).flatMap((label) => {
    const items = notifications.filter((item) => notificationDayGroup(item.createdAt) === label);
    return items.length ? [{ kind: "heading", id: `heading-${label}`, label }, ...items.map((notification) => ({ kind: "notification" as const, id: notification.id, notification }))] : [];
  }), [notifications]);

  return <Shell><View style={styles.screen}>
    <View style={styles.header}><Pressable accessibilityRole="button" onPress={onBack}><Text style={styles.back}>‹ Back</Text></Pressable><Text style={styles.kicker}>{role === "ENGINEER" ? "Executive Engineer" : "Your updates"}</Text><Text style={styles.heading}>Notifications</Text></View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {loading && notifications.length === 0 ? <ActivityIndicator color={colors.primary} /> : <FlatList
      contentContainerStyle={rows.length ? styles.list : styles.emptyList}
      data={rows}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyIcon}>♢</Text><Text style={styles.emptyText}>You’re all caught up — no notifications here yet.</Text></View>}
      onRefresh={() => void refresh()}
      refreshing={loading}
      renderItem={({ item }) => {
        if (item.kind === "heading") return <Text style={styles.day}>{item.label}</Text>;
        const display = notificationPresentation(item.notification.type);
        return <NotificationRow icon={display.icon} message={display.message} onPress={() => onOpen(item.notification)} time={relativeNotificationTime(item.notification.createdAt)} tone={display.tone} />;
      }}
    />}
  </View></Shell>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 16, padding: 20, paddingTop: 28 },
  header: { gap: 5 }, back: { color: colors.primary, fontSize: 14, fontWeight: "500", marginBottom: 8 },
  kicker: { color: colors.primary, fontSize: 12, fontWeight: "500" },
  heading: { color: colors.ink, fontSize: 22, fontWeight: "500" },
  list: { gap: 0, paddingBottom: 36 }, emptyList: { flexGrow: 1 },
  day: { color: colors.muted, fontSize: 12, fontWeight: "500", paddingBottom: 9, paddingTop: 20 },
  row: { alignItems: "center", backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: 13, paddingHorizontal: 14, paddingVertical: 15 },
  icon: { alignItems: "center", borderRadius: 20, height: 40, justifyContent: "center", width: 40 },
  iconText: { fontSize: 16, fontWeight: "500" },
  info: { backgroundColor: colors.infoBg }, infoText: { color: colors.infoText },
  success: { backgroundColor: colors.successBg }, successText: { color: colors.successText },
  warning: { backgroundColor: colors.warningBg }, warningText: { color: colors.warningText },
  danger: { backgroundColor: colors.dangerBg }, dangerText: { color: colors.dangerText },
  copy: { flex: 1, gap: 5 }, message: { color: colors.ink, fontSize: 14, fontWeight: "500", lineHeight: 20 },
  time: { color: colors.muted, fontSize: 12 }, arrow: { color: colors.muted, fontSize: 26 },
  empty: { alignItems: "center", flex: 1, gap: 12, justifyContent: "center", padding: 30 }, emptyIcon: { color: colors.primary, fontSize: 38 }, emptyText: { color: colors.muted, textAlign: "center" },
  error: { color: colors.danger },
});
