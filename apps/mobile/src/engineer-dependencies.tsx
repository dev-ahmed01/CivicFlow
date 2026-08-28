import { useCallback, useEffect, useState } from "react";
import type { DependencyListItem, DependencyResponse } from "@civicos/shared";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { loadDependencies, respondToDependency } from "./api";
import { Shell } from "./screens";
import { useResponsiveMetrics } from "./screen-shell";
import { internal as colors } from "./theme";

type Direction = "received" | "sent";

const responseActions: Array<{ label: string; response: DependencyResponse }> = [
  { label: "Assign to me", response: { action: "ASSIGN_ENGINEER" } },
  { label: "Unavailable", response: { action: "DECLINE_UNAVAILABLE" } },
  { label: "Not Our Scope", response: { action: "DECLINE_NOT_CONCERNED" } },
];

function countdown(deadline: string | Date, now: number): string {
  const remaining = new Date(deadline).getTime() - now;
  if (remaining <= 0) return "Response overdue";
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m remaining`;
}

function DependencyCard({ dependency, direction, currentUserId, now, busy, onRespond }: {
  dependency: DependencyListItem;
  direction: Direction;
  currentUserId: string;
  now: number;
  busy: boolean;
  onRespond: (response: DependencyResponse) => void;
}) {
  const agency = direction === "received" ? dependency.requestingAgency : dependency.respondingAgency;
  const pending = dependency.state === "PENDING_RESPONSE";
  const assignedToMe = direction === "received" && dependency.state === "ASSIGNED" && dependency.assignedEngineer?.id === currentUserId;

  return <View style={styles.card}>
    <View style={styles.cardTop}>
      <View style={styles.cardHeading}><Text style={styles.ticket}>{dependency.project.ticket?.id ?? dependency.project.id}</Text><Text style={styles.title}>{agency.name}</Text></View>
      <Text style={[styles.badge, dependency.state === "ESCALATED" && styles.badgeWarning]}>{dependency.state.replaceAll("_", " ")}</Text>
    </View>
    <Text style={styles.requirement}>{dependency.requirement}</Text>
    <Text style={styles.meta}>Deadline {new Date(dependency.deadline).toLocaleString()}</Text>
    {pending ? <Text style={styles.countdown}>{countdown(dependency.deadline, now)}</Text> : null}
    {direction === "received" && pending ? <View accessibilityLabel="Dependency response choices" style={styles.actions}>
      {responseActions.map((item) => <Pressable accessibilityRole="button" disabled={busy} key={item.label} onPress={() => onRespond(item.response)} style={({ pressed }) => [styles.action, pressed && styles.pressed, busy && styles.disabled]}><Text style={styles.actionLabel}>{item.label}</Text></Pressable>)}
    </View> : null}
    {assignedToMe ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => onRespond({ action: "FULFILL" })} style={[styles.fulfill, busy && styles.disabled]}><Text style={styles.fulfillLabel}>Mark my portion complete</Text></Pressable> : null}
  </View>;
}

export function EngineerDependenciesApp({ currentUserId, onBack }: { currentUserId: string; onBack?: () => void }) {
  const [direction, setDirection] = useState<Direction>("received");
  const [dependencies, setDependencies] = useState<DependencyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const [now, setNow] = useState(Date.now());
  const { horizontalPadding } = useResponsiveMetrics();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try { setDependencies(await loadDependencies(direction)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load dependencies"); }
    finally { setLoading(false); }
  }, [direction]);

  useEffect(() => { void refresh(); }, [refresh]);

  const visibleCount = dependencies.length;

  const respond = async (dependencyId: string, response: DependencyResponse) => {
    setBusyId(dependencyId);
    try {
      await respondToDependency(dependencyId, response);
      await refresh();
    } catch (caught) {
      Alert.alert("Couldn’t update dependency", caught instanceof Error ? caught.message : "Please try again.");
    } finally { setBusyId(undefined); }
  };

  return <Shell><View style={[styles.screen, { paddingHorizontal: horizontalPadding }]}>
    <View style={styles.header}>{onBack ? <Pressable accessibilityRole="button" onPress={onBack}><Text style={styles.back}>‹ Back</Text></Pressable> : null}<Text style={styles.eyebrow}>Executive Engineer</Text><Text style={styles.heading}>Dependencies</Text><Text style={styles.intro}>Coordinate work requested by your agency and partner agencies.</Text></View>
    <View style={styles.tabs}>
      {(["received", "sent"] as const).map((item) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: direction === item }} key={item} onPress={() => setDirection(item)} style={[styles.tab, direction === item && styles.tabActive]}><Text style={[styles.tabLabel, direction === item && styles.tabLabelActive]}>{item === "received" ? "Inbox" : "Outbox"}{direction === item ? ` (${visibleCount})` : ""}</Text></Pressable>)}
    </View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {loading && dependencies.length === 0 ? <ActivityIndicator color={colors.primary} /> : <FlatList data={dependencies} keyExtractor={(item) => item.id} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.primary} />} contentContainerStyle={styles.list} ListEmptyComponent={<Text style={styles.empty}>No {direction} dependency requests.</Text>} renderItem={({ item }) => <DependencyCard dependency={item} direction={direction} currentUserId={currentUserId} now={now} busy={busyId === item.id} onRespond={(response) => void respond(item.id, response)} />} />}
  </View></Shell>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 16, padding: 20, paddingTop: 28 },
  header: { gap: 6 },
  back: { color: colors.primary, fontSize: 14, fontWeight: "500", marginBottom: 8 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: "500" },
  heading: { color: colors.ink, fontSize: 22, fontWeight: "500" },
  intro: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  tabs: { backgroundColor: colors.surface, borderRadius: 14, flexDirection: "row", padding: 4 },
  tab: { alignItems: "center", borderRadius: 11, flex: 1, paddingVertical: 11 },
  tabActive: { backgroundColor: colors.primary },
  tabLabel: { color: colors.muted, fontSize: 14, fontWeight: "500" },
  tabLabelActive: { color: "white" },
  list: { gap: 12, paddingBottom: 36 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: 12, padding: 17 },
  cardTop: { alignItems: "flex-start", flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  cardHeading: { flex: 1, gap: 3 },
  ticket: { color: colors.primary, fontSize: 12, fontWeight: "500" },
  title: { color: colors.ink, fontSize: 16, fontWeight: "500" },
  badge: { backgroundColor: colors.infoBg, borderRadius: 20, color: colors.infoText, fontSize: 12, fontWeight: "500", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 5 },
  badgeWarning: { backgroundColor: colors.warningBg, color: colors.warningText },
  requirement: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  meta: { color: colors.muted, fontSize: 12 },
  countdown: { color: colors.warningText, fontSize: 13, fontWeight: "500" },
  actions: { gap: 8 },
  action: { alignItems: "center", borderColor: colors.primary, borderRadius: 12, borderWidth: 1, padding: 11 },
  actionLabel: { color: colors.primary, fontSize: 14, fontWeight: "500" },
  fulfill: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 12, padding: 12 },
  fulfillLabel: { color: colors.surface, fontSize: 14, fontWeight: "500" },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
  error: { color: colors.danger, fontSize: 14 },
  empty: { color: colors.muted, fontSize: 16, paddingVertical: 40, textAlign: "center" },
});
