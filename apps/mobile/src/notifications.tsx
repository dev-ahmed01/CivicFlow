import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notificationPresentation, relativeNotificationTime, type UserRole } from "@civicos/shared";
import { ActivityIndicator, SectionList, StyleSheet, Text, View } from "react-native";
import { loadNotifications, markNotificationsRead, type MobileNotification } from "./api";
import { clearAppBadge } from "./push-notifications";
import { NotificationRow, ScreenHeader } from "./components";
import { Shell } from "./screen-shell";
import { colors, fontWeights } from "./theme";

type GroupName = "Needs attention" | "Community validation" | "Ticket updates" | "Completion verification" | "Grievance updates";
type NotificationSection = { title: GroupName; data: MobileNotification[] };

function groupFor(type: string): GroupName {
  if (type === "ACTION_ATTENTION") return "Needs attention";
  if (type === "VALIDATION_REQUEST" || type === "TICKET_VALIDATED") return "Community validation";
  if (type.includes("COMPLETION") || type === "WORK_COMPLETED" || type === "PROJECT_REWORK_REQUESTED" || type === "TICKET_RESOLVED") return "Completion verification";
  if (type.includes("GRIEVANCE")) return "Grievance updates";
  return "Ticket updates";
}

const groupOrder: GroupName[] = ["Needs attention", "Community validation", "Ticket updates", "Completion verification", "Grievance updates"];

export function NotificationsScreen({ role, onBack, onOpen, onViewed }: { role: UserRole; onBack: () => void; onOpen: (notification: MobileNotification) => void; onViewed: () => void }) {
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
      await markNotificationsRead(result.notifications.filter((item) => !item.read).map((item) => item.id));
      await clearAppBadge();
      onViewedRef.current();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load updates"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const sections = useMemo<NotificationSection[]>(() => groupOrder.flatMap((title) => {
    const data = notifications.filter((notification) => groupFor(notification.type) === title);
    return data.length ? [{ title, data }] : [];
  }), [notifications]);
  return <Shell><View style={styles.screen}><ScreenHeader eyebrow={role === "ENGINEER" ? "Field operations" : "Your updates"} title="Updates" subtitle={role === "ENGINEER" ? "Assignments, coordination and work alerts." : "Validation requests, ticket progress, completion checks and grievances."} onBack={onBack} />{error ? <Text style={styles.error}>{error}</Text> : null}{loading && notifications.length === 0 ? <ActivityIndicator color={colors.primary} /> : <SectionList contentContainerStyle={sections.length ? styles.list : styles.emptyList} sections={sections} keyExtractor={(item) => item.id} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyIcon}>✓</Text><Text style={styles.emptyTitle}>You’re all caught up</Text><Text style={styles.emptyText}>New City Connect updates will appear here.</Text></View>} onRefresh={() => void refresh()} refreshing={loading} renderSectionHeader={({ section }) => <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{section.title}</Text><View style={styles.count}><Text style={styles.countText}>{section.data.length}</Text></View></View>} renderItem={({ item }) => { const display = notificationPresentation(item.type); return <NotificationRow icon={display.icon} message={display.message} onPress={() => onOpen(item)} time={relativeNotificationTime(item.createdAt)} tone={display.tone} />; }} />}</View></Shell>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 12, padding: 20, paddingBottom: 0, paddingTop: 22 }, list: { paddingBottom: 30 }, emptyList: { flexGrow: 1 }, sectionHeader: { alignItems: "center", backgroundColor: colors.canvas, flexDirection: "row", gap: 7, paddingBottom: 8, paddingTop: 18 }, sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: fontWeights.bold }, count: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 10, justifyContent: "center", minHeight: 20, minWidth: 20 }, countText: { color: colors.primary, fontSize: 10, fontWeight: fontWeights.bold }, error: { color: colors.danger, fontSize: 14 }, empty: { alignItems: "center", flex: 1, gap: 9, justifyContent: "center", padding: 35 }, emptyIcon: { backgroundColor: colors.primarySoft, borderRadius: 30, color: colors.primary, fontSize: 28, overflow: "hidden", paddingHorizontal: 17, paddingVertical: 10 }, emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: fontWeights.bold }, emptyText: { color: colors.muted, fontSize: 13, textAlign: "center" },
});
