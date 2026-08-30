import { useCallback, useEffect, useState } from "react";
import type { CoordinationAction, CoordinationRequest } from "@civicos/shared";
import * as ImagePicker from "expo-image-picker";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { actOnCoordinationRequest, loadCoordinationRequests, uploadCoordinationEvidence, type LocalImage } from "./api";
import { PrimaryButton, SecondaryButton } from "./components";
import { Shell } from "./screens";
import { useResponsiveMetrics } from "./screen-shell";
import { internal as colors } from "./theme";

function label(value: string): string {
  const normalized = value.replaceAll("_", " ").replaceAll("-", " ").toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function localImage(asset: ImagePicker.ImagePickerAsset): LocalImage {
  const contentType = asset.mimeType === "image/png" || asset.mimeType === "image/webp" || asset.mimeType === "image/heic" ? asset.mimeType : "image/jpeg";
  return { uri: asset.uri, fileName: asset.fileName ?? `coordination-${Date.now()}.${contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1]}`, contentType };
}

function CoordinationTask({ item, expanded, busy, onToggle, onRefresh }: {
  item: CoordinationRequest;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [notes, setNotes] = useState("");
  const [evidence, setEvidence] = useState<LocalImage>();
  const [submitting, setSubmitting] = useState(false);

  const pickEvidence = async () => {
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (!result.canceled && result.assets[0]) setEvidence(localImage(result.assets[0]));
  };

  const perform = async (action: CoordinationAction) => {
    setSubmitting(true);
    try {
      const entryId = await actOnCoordinationRequest(item.id, action);
      if (evidence) await uploadCoordinationEvidence(item.id, entryId, evidence);
      setNotes("");
      setEvidence(undefined);
      await onRefresh();
    } catch (caught) {
      Alert.alert("Couldn’t update coordination task", caught instanceof Error ? caught.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const location = item.project.locationLabel ?? item.project.ticket?.address ?? item.project.ward?.name ?? "Location not recorded";
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" onPress={onToggle} style={styles.cardPressable}>
      <View style={styles.cardHeader}><View style={styles.cardTitleGroup}><Text style={styles.kicker}>{label(item.requestTypeKey)}</Text><Text style={styles.title}>{item.subject}</Text></View><Text style={styles.badge}>{label(item.status)}</Text></View>
      <Text style={styles.body}>{item.details}</Text>
      <View style={styles.metadata}><Text style={styles.meta}>{item.requestingAgency.name} → {item.respondingAgency.name}</Text><Text style={styles.meta}>{item.project.referenceNumber} · {location}</Text><Text style={styles.deadline}>Response due {new Date(item.responseDeadline).toLocaleString()}</Text></View>
      <Text style={styles.openLabel}>{expanded ? "Hide work record" : "Open work record"}</Text>
    </Pressable>
    {expanded ? <View style={styles.expanded}>
      <Text style={styles.sectionLabel}>Conversation and activity</Text>
      {item.entries.map((entry) => <View key={entry.id} style={styles.entry}><View style={styles.entryHeader}><Text style={styles.entrySender}>{entry.sender.email ?? label(entry.sender.role)}</Text><Text style={styles.entryTime}>{new Date(entry.createdAt).toLocaleString()}</Text></View><Text style={styles.entryAction}>{label(entry.action)}</Text>{entry.message ? <Text style={styles.entryMessage}>{entry.message}</Text> : null}{entry.attachments.map((attachment) => <Text key={attachment.id} style={styles.attachment}>Evidence · {attachment.fileName}</Text>)}</View>)}
      {!(["COMPLETED", "CLOSED", "REJECTED"] as string[]).includes(item.status) ? <View style={styles.actionPanel}><Text style={styles.sectionLabel}>Field update</Text><TextInput accessibilityLabel="Inspection or coordination notes" multiline onChangeText={setNotes} placeholder="Add inspection findings, response, or completion notes" placeholderTextColor={colors.muted} style={styles.input} value={notes} /><SecondaryButton disabled={submitting} onPress={() => void pickEvidence()}>{evidence ? "Evidence photo ready" : "Take evidence photo"}</SecondaryButton><View style={styles.actionStack}><SecondaryButton disabled={submitting} onPress={() => void perform({ action: "START_PROGRESS", ...(notes.trim() ? { message: notes.trim() } : {}) })}>Start work</SecondaryButton><SecondaryButton disabled={busy || submitting || notes.trim().length < 2 || item.inspectionNeeded && !evidence} onPress={() => void perform({ action: "INSPECTION_COMPLETE", notes: notes.trim() })}>Mark inspection complete</SecondaryButton><PrimaryButton disabled={busy || submitting || notes.trim().length < 2} onPress={() => void perform({ action: "COMPLETE", notes: notes.trim() })}>Mark requested action completed</PrimaryButton></View>{item.inspectionNeeded ? <Text style={styles.help}>Inspection completion requires notes and an evidence photo.</Text> : null}</View> : null}
    </View> : null}
  </View>;
}

export function EngineerDependenciesApp({ onBack }: { currentUserId: string; onBack?: () => void }) {
  const [requests, setRequests] = useState<CoordinationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [expandedId, setExpandedId] = useState<string>();
  const { horizontalPadding } = useResponsiveMetrics();

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setRequests(await loadCoordinationRequests()); setError(undefined); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load coordination tasks"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  return <Shell><ScrollView contentContainerStyle={[styles.screen, { paddingHorizontal: horizontalPadding }]} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.primary} />}>
    <View style={styles.header}>{onBack ? <Pressable accessibilityRole="button" onPress={onBack}><Text style={styles.back}>‹ Back</Text></Pressable> : null}<Text style={styles.eyebrow}>Executive Engineer</Text><Text style={styles.heading}>Coordination tasks</Text><Text style={styles.intro}>Assigned inspections and inter-agency actions remain linked to their civic work record.</Text></View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {loading && requests.length === 0 ? <ActivityIndicator color={colors.primary} /> : null}
    {requests.map((item) => <CoordinationTask busy={loading} expanded={expandedId === item.id} item={item} key={item.id} onRefresh={refresh} onToggle={() => setExpandedId((current) => current === item.id ? undefined : item.id)} />)}
    {!loading && requests.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>No assigned coordination tasks.</Text><Text style={styles.meta}>Tasks appear here after your agency’s Project Head assigns you.</Text></View> : null}
  </ScrollView></Shell>;
}

const styles = StyleSheet.create({
  screen: { gap: 14, paddingBottom: 40, paddingTop: 28 },
  header: { gap: 6, marginBottom: 4 },
  back: { color: colors.primary, fontSize: 14, fontWeight: "500", marginBottom: 8 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  heading: { color: colors.ink, fontSize: 24, fontWeight: "600" },
  intro: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  cardPressable: { gap: 12, padding: 17 },
  cardHeader: { alignItems: "flex-start", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  cardTitleGroup: { flex: 1, gap: 4 },
  kicker: { color: colors.primary, fontSize: 11, fontWeight: "600" },
  title: { color: colors.ink, fontSize: 17, fontWeight: "600", lineHeight: 23 },
  badge: { backgroundColor: colors.infoBg, borderRadius: 20, color: colors.infoText, fontSize: 11, fontWeight: "600", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 5 },
  body: { color: colors.ink, fontSize: 14, lineHeight: 21 },
  metadata: { backgroundColor: colors.canvas, borderRadius: 10, gap: 4, padding: 11 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  deadline: { color: colors.warningText, fontSize: 12, fontWeight: "600" },
  openLabel: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  expanded: { borderTopColor: colors.border, borderTopWidth: 1, gap: 12, padding: 17 },
  sectionLabel: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  entry: { borderLeftColor: colors.primary, borderLeftWidth: 2, gap: 5, paddingLeft: 12, paddingVertical: 5 },
  entryHeader: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
  entrySender: { color: colors.ink, flex: 1, fontSize: 12, fontWeight: "600" },
  entryTime: { color: colors.muted, fontSize: 10 },
  entryAction: { color: colors.primary, fontSize: 10, fontWeight: "600" },
  entryMessage: { color: colors.ink, fontSize: 13, lineHeight: 19 },
  attachment: { backgroundColor: colors.canvas, borderRadius: 8, color: colors.primary, fontSize: 11, padding: 8 },
  actionPanel: { borderTopColor: colors.border, borderTopWidth: 1, gap: 10, paddingTop: 14 },
  input: { backgroundColor: colors.canvas, borderColor: colors.border, borderRadius: 11, borderWidth: 1, color: colors.ink, minHeight: 96, padding: 12, textAlignVertical: "top" },
  actionStack: { gap: 8 },
  help: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  error: { color: colors.danger, fontSize: 14 },
  empty: { alignItems: "center", gap: 7, paddingVertical: 42 },
  emptyTitle: { color: colors.ink, fontSize: 16, fontWeight: "600" },
});
