import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { loadNearbyCivicWorks, type MobilePublicCivicWork } from "./api";
import { AppIcon, Card, ScreenHeader, SecondaryButton, StatusChip } from "./components";
import { formatNearbyDate, formatNearbyDistance } from "./nearby-work-display";
import { Shell, useResponsiveMetrics } from "./screen-shell";
import { colors, fontWeights, typeScale } from "./theme";

function WorkCard({ work }: { work: MobilePublicCivicWork }) {
  return <Card style={styles.card}>
    <View style={styles.cardTop}>
      <View style={styles.workIcon}><AppIcon color={colors.primary} name="construct-outline" size={22} /></View>
      <View style={styles.cardTitle}>
        <Text style={styles.workType}>{work.workType}</Text>
        <Text style={styles.reference}>{work.referenceNumber}</Text>
      </View>
      <StatusChip label={work.statusLabel} />
    </View>
    <View style={styles.detailRow}><AppIcon color={colors.muted} name="business-outline" size={17} /><Text style={styles.detail}>{work.agency}</Text></View>
    <View style={styles.detailRow}><AppIcon color={colors.muted} name="location-outline" size={17} /><Text style={styles.detail}>{work.approximateLocation.ward} · {formatNearbyDistance(work.distanceMeters)}</Text></View>
    <Text style={styles.progress}>{work.publicProgress}</Text>
    <View style={styles.dates}>
      <View style={styles.dateCell}><Text style={styles.dateLabel}>Planned start</Text><Text style={styles.dateValue}>{formatNearbyDate(work.plannedStart)}</Text></View>
      <View style={styles.dateCell}><Text style={styles.dateLabel}>{work.completionStatus === "COMPLETED" ? "Completed" : "Expected by"}</Text><Text style={styles.dateValue}>{formatNearbyDate(work.completedAt ?? work.expectedCompletion)}</Text></View>
    </View>
  </Card>;
}

export function NearbyWorksScreen({ onBack }: { onBack: () => void }) {
  const [works, setWorks] = useState<MobilePublicCivicWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const { horizontalPadding } = useResponsiveMetrics();

  const refresh = useCallback(async () => {
    setLoading(true); setError(undefined);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error("Allow location access to see public civic work near you.");
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const result = await loadNearbyCivicWorks(position.coords.latitude, position.coords.longitude);
      setWorks(result.works);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nearby work could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return <Shell><ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: horizontalPadding }]}>
    <ScreenHeader eyebrow="Civic transparency" title="Nearby Works" subtitle="What’s happening here? See simple public updates for civic work within about 2 km." onBack={onBack} />
    <View style={styles.privacyNote}><AppIcon color={colors.primary} name="shield-checkmark-outline" size={19} /><Text style={styles.privacyText}>Only public work details and approximate locations are shown.</Text></View>
    {loading ? <View style={styles.state}><ActivityIndicator color={colors.primary} size="large" /><Text style={styles.stateText}>Finding public work near you…</Text></View> : null}
    {!loading && error ? <View style={styles.state}><AppIcon color={colors.danger} name="location-outline" size={30} /><Text style={styles.error}>{error}</Text><SecondaryButton onPress={() => void refresh()}>Try again</SecondaryButton></View> : null}
    {!loading && !error && works.length === 0 ? <View style={styles.state}><AppIcon color={colors.muted} name="map-outline" size={34} /><Text style={styles.emptyTitle}>No public works nearby</Text><Text style={styles.stateText}>There are no published civic works within about 2 km right now.</Text><SecondaryButton onPress={() => void refresh()}>Refresh</SecondaryButton></View> : null}
    {!loading && !error && works.length > 0 ? <View style={styles.list}>{works.map((work) => <WorkCard key={work.id} work={work} />)}</View> : null}
  </ScrollView></Shell>;
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 36, paddingTop: 18 },
  privacyNote: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 14, flexDirection: "row", gap: 9, padding: 13 },
  privacyText: { color: colors.ink, flex: 1, fontSize: 12, lineHeight: 18 },
  list: { gap: 13 },
  card: { gap: 12 },
  cardTop: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  workIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 20, height: 40, justifyContent: "center", width: 40 },
  cardTitle: { flex: 1, gap: 3 },
  workType: { color: colors.ink, fontSize: typeScale.input, fontWeight: fontWeights.bold, lineHeight: 21 },
  reference: { color: colors.muted, fontSize: 11 },
  detailRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  detail: { color: colors.muted, flex: 1, fontSize: 13 },
  progress: { backgroundColor: colors.surfaceAlt, borderRadius: 12, color: colors.ink, fontSize: 13, lineHeight: 19, padding: 12 },
  dates: { borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: 14, paddingTop: 12 },
  dateCell: { flex: 1, gap: 4 },
  dateLabel: { color: colors.muted, fontSize: 10, fontWeight: fontWeights.semibold, textTransform: "uppercase" },
  dateValue: { color: colors.ink, fontSize: 13, fontWeight: fontWeights.semibold },
  state: { alignItems: "center", gap: 13, justifyContent: "center", minHeight: 280, padding: 26 },
  stateText: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  emptyTitle: { color: colors.ink, fontSize: typeScale.section, fontWeight: fontWeights.bold },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21, textAlign: "center" },
});
