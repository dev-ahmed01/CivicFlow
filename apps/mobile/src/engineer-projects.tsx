import { useCallback, useEffect, useState } from "react";
import type { EngineerProjectDetail, ProjectListItem, ProjectState } from "@civicos/shared";
import * as ImagePicker from "expo-image-picker";
import { ActivityIndicator, Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  internalLogin,
  loadAgencies,
  loadEngineerProject,
  loadEngineerProjects,
  submitCompletionEvidence,
  uptakeProject,
  updateProjectStatus,
  updateProjectTimeline,
  type CurrentAuth,
  type LocalImage,
} from "./api";
import { PrimaryButton, ScreenHeader, SecondaryButton } from "./components";
import { EngineerDependenciesApp } from "./engineer-dependencies";
import { Shell } from "./screens";
import { colors } from "./theme";

type EngineerScreen = "dashboard" | "mine" | "assigned" | "detail" | "timeline" | "geographic" | "completion" | "dependencies";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Please try again.";
}

function stateLabel(state: string): string {
  return state.replaceAll("_", " ");
}

function daysRemaining(end: string | Date | null): string {
  if (!end) return "Timeline not set";
  const days = Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)} days overdue`;
  return days === 1 ? "1 day remaining" : `${days} days remaining`;
}

export function EngineerLoginScreen({ onLogin, onCancel }: { onLogin: (auth: CurrentAuth) => void; onCancel: () => void }) {
  const [email, setEmail] = useState("engineer.pwd@civicos.local");
  const [password, setPassword] = useState("CivicOS@123");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try { onLogin(await internalLogin(email.trim().toLowerCase(), password)); }
    catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); }
  };
  return <Shell><ScrollView contentContainerStyle={styles.content}><ScreenHeader eyebrow="Executive Engineer" title="Sign in to field operations" onBack={onCancel} /><Text style={styles.intro}>Your role is detected from your account after sign-in.</Text><TextInput accessibilityLabel="Work email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="Work email" placeholderTextColor={colors.muted} style={styles.input} /><TextInput accessibilityLabel="Password" secureTextEntry value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={colors.muted} style={styles.input} />{error ? <Text style={styles.error}>{error}</Text> : null}<PrimaryButton disabled={busy || !email || !password} onPress={() => void submit()}>{busy ? "Signing in…" : "Sign in"}</PrimaryButton><Text style={styles.demo}>Demo: engineer.pwd@civicos.local / CivicOS@123</Text></ScrollView></Shell>;
}

function ProjectCard({ project, canEdit, onOpen, onAccept }: { project: ProjectListItem; canEdit: boolean; onOpen: () => void; onAccept?: () => void }) {
  return <View style={styles.card}><Pressable accessibilityRole="button" onPress={onOpen} style={styles.cardBody}><View style={styles.cardTop}><View style={styles.cardHeading}><Text style={styles.kicker}>{project.agency.name}</Text><Text style={styles.cardTitle}>{project.ticket?.title ?? "Standalone project"}</Text></View><Text style={styles.chip}>{stateLabel(project.state)}</Text></View><Text style={styles.meta}>{project.ticket?.ward.name ?? "Ward unavailable"} · {daysRemaining(project.plannedEnd)}</Text>{!canEdit ? <Text style={styles.readOnly}>Read-only · Owned by another engineer or agency</Text> : null}</Pressable>{onAccept ? <PrimaryButton onPress={onAccept}>Accept / Uptake</PrimaryButton> : null}</View>;
}

function ProjectsScreen({ scope, auth, onBack, onOpen }: { scope: "mine" | "assigned" | "geographic"; auth: CurrentAuth; onBack: () => void; onOpen: (id: string) => void }) {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [agencies, setAgencies] = useState<Array<{ id: string; name: string }>>([]);
  const [agencyId, setAgencyId] = useState<string>();
  const [status, setStatus] = useState<ProjectState>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const refresh = useCallback(async () => {
    setLoading(true); setError(undefined);
    try { setProjects(await loadEngineerProjects(scope, { agencyId, status })); }
    catch (caught) { setError(errorMessage(caught)); }
    finally { setLoading(false); }
  }, [agencyId, scope, status]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (scope === "geographic") void loadAgencies().then(setAgencies).catch(() => setAgencies([])); }, [scope]);
  const accept = async (projectId: string) => {
    try { await uptakeProject(projectId); await refresh(); onOpen(projectId); }
    catch (caught) { Alert.alert("Couldn't accept project", errorMessage(caught)); }
  };
  const title = scope === "assigned" ? "Assigned work" : scope === "geographic" ? "Area projects" : "My ongoing projects";
  return <Shell><View style={styles.screen}><ScreenHeader eyebrow={scope === "geographic" ? "List view · Map fast-follow" : "Executive Engineer"} title={title} onBack={onBack} />{scope === "geographic" ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}><Pressable onPress={() => setAgencyId(undefined)} style={[styles.filter, !agencyId && styles.filterActive]}><Text style={!agencyId ? styles.filterTextActive : styles.filterText}>All agencies</Text></Pressable>{agencies.map((agency) => <Pressable key={agency.id} onPress={() => setAgencyId(agency.id)} style={[styles.filter, agencyId === agency.id && styles.filterActive]}><Text style={agencyId === agency.id ? styles.filterTextActive : styles.filterText}>{agency.name}</Text></Pressable>)}{(["PENDING_UPTAKE", "ACTIVE", "COMPLETED"] as ProjectState[]).map((item) => <Pressable key={item} onPress={() => setStatus(status === item ? undefined : item)} style={[styles.filter, status === item && styles.filterActive]}><Text style={status === item ? styles.filterTextActive : styles.filterText}>{stateLabel(item)}</Text></Pressable>)}</ScrollView> : null}{loading ? <ActivityIndicator color={colors.primary} /> : null}{error ? <Text style={styles.error}>{error}</Text> : null}<FlatList data={projects} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} ListEmptyComponent={!loading ? <Text style={styles.empty}>No projects in this view.</Text> : null} renderItem={({ item }) => { const canEdit = item.engineerId === auth.userId && item.agencyId === auth.agencyId; return <ProjectCard project={item} canEdit={canEdit} onOpen={() => onOpen(item.id)} onAccept={scope === "assigned" && canEdit && item.state === "PENDING_UPTAKE" ? () => void accept(item.id) : undefined} />; }} /></View></Shell>;
}

function TimelineScreen({ project, onBack, onSaved }: { project: EngineerProjectDetail; onBack: () => void; onSaved: () => void }) {
  const datePart = (value: string | Date | null, fallbackDays: number) => value ? new Date(value).toISOString().slice(0, 10) : new Date(Date.now() + fallbackDays * 86_400_000).toISOString().slice(0, 10);
  const [start, setStart] = useState(datePart(project.plannedStart, 0));
  const [end, setEnd] = useState(datePart(project.plannedEnd, 7));
  const [description, setDescription] = useState(project.workDescription ?? "");
  const [flags, setFlags] = useState(project.dependencyFlags.join(", "));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await updateProjectTimeline(project.id, { plannedStart: `${start}T00:00:00.000Z`, plannedEnd: `${end}T23:59:59.999Z`, workDescription: description, dependencyFlags: flags.split(",").map((item) => item.trim()).filter(Boolean) });
      onSaved();
    } catch (caught) { Alert.alert("Couldn't save execution details", errorMessage(caught)); }
    finally { setBusy(false); }
  };
  return <Shell><ScrollView contentContainerStyle={styles.content}><ScreenHeader eyebrow="Set timeline" title="Execution details" onBack={onBack} /><Text style={styles.intro}>Date fields use YYYY-MM-DD. Saving runs the advisory conflict check and activates the project.</Text><Text style={styles.label}>Start date</Text><TextInput accessibilityLabel="Planned start date" value={start} onChangeText={setStart} placeholder="YYYY-MM-DD" style={styles.input} /><Text style={styles.label}>End date</Text><TextInput accessibilityLabel="Planned end date" value={end} onChangeText={setEnd} placeholder="YYYY-MM-DD" style={styles.input} /><Text style={styles.label}>Work description</Text><TextInput accessibilityLabel="Work description" multiline value={description} onChangeText={setDescription} style={[styles.input, styles.textarea]} /><Text style={styles.label}>Dependency flags</Text><TextInput accessibilityLabel="Dependency flags" value={flags} onChangeText={setFlags} placeholder="Traffic diversion, utility clearance" style={styles.input} /><PrimaryButton disabled={busy || description.trim().length < 10} onPress={() => void submit()}>{busy ? "Checking conflicts…" : "Save timeline & activate"}</PrimaryButton></ScrollView></Shell>;
}

function CompletionScreen({ projectId, onBack, onSubmitted }: { projectId: string; onBack: () => void; onSubmitted: () => void }) {
  const [image, setImage] = useState<LocalImage>();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (!result.canceled) {
      const asset = result.assets[0];
      if (!asset) return;
      const extension = asset.uri.split(".").pop()?.toLowerCase();
      const contentType: LocalImage["contentType"] = asset.mimeType === "image/png" || extension === "png" ? "image/png" : asset.mimeType === "image/webp" || extension === "webp" ? "image/webp" : asset.mimeType === "image/heic" || extension === "heic" ? "image/heic" : "image/jpeg";
      setImage({ uri: asset.uri, fileName: asset.fileName ?? `completion-${Date.now()}.${extension ?? "jpg"}`, contentType });
    }
  };
  const submit = async () => {
    if (!image) return;
    setBusy(true);
    try { await submitCompletionEvidence(projectId, image, notes); onSubmitted(); }
    catch (caught) { Alert.alert("Couldn't submit evidence", errorMessage(caught)); }
    finally { setBusy(false); }
  };
  return <Shell><ScrollView contentContainerStyle={styles.content}><ScreenHeader eyebrow="Completion evidence" title="Submit for verification" onBack={onBack} /><Pressable accessibilityRole="button" onPress={() => void pick()} style={styles.photo}>{image ? <Image source={{ uri: image.uri }} style={styles.photoImage} /> : <Text style={styles.photoPrompt}>Take completion photo</Text>}</Pressable><TextInput accessibilityLabel="Completion notes" multiline value={notes} onChangeText={setNotes} placeholder="Describe completed work and visible result" placeholderTextColor={colors.muted} style={[styles.input, styles.textarea]} /><PrimaryButton disabled={busy || !image || notes.trim().length < 3} onPress={() => void submit()}>{busy ? "Submitting…" : "Submit for Verification"}</PrimaryButton></ScrollView></Shell>;
}

function ProjectDetailScreen({ projectId, onBack, onTimeline, onCompletion }: { projectId: string; onBack: () => void; onTimeline: (project: EngineerProjectDetail) => void; onCompletion: () => void }) {
  const [project, setProject] = useState<EngineerProjectDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [note, setNote] = useState("");
  const refresh = useCallback(async () => { setLoading(true); try { setProject(await loadEngineerProject(projectId)); setError(undefined); } catch (caught) { setError(errorMessage(caught)); } finally { setLoading(false); } }, [projectId]);
  useEffect(() => { void refresh(); }, [refresh]);
  const accept = async () => { try { await uptakeProject(projectId); await refresh(); } catch (caught) { Alert.alert("Couldn't accept project", errorMessage(caught)); } };
  const update = async (complete = false) => { try { await updateProjectStatus(projectId, { state: complete ? "COMPLETED" : undefined, note: note.trim() || undefined }); setNote(""); await refresh(); } catch (caught) { Alert.alert("Couldn't update project", errorMessage(caught)); } };
  if (loading && !project) return <Shell><ActivityIndicator style={styles.loader} color={colors.primary} /></Shell>;
  if (!project) return <Shell><View style={styles.content}><ScreenHeader title="Project" onBack={onBack} /><Text style={styles.error}>{error}</Text></View></Shell>;
  return <Shell><ScrollView contentContainerStyle={styles.content}><ScreenHeader eyebrow={project.editable ? "Owned project" : "Geographic project · Read-only"} title={project.ticket?.title ?? "Project detail"} onBack={onBack} /><Text style={styles.chip}>{stateLabel(project.state)}</Text><View style={styles.card}><Text style={styles.kicker}>Ticket context</Text><Text style={styles.cardTitle}>{project.ticket?.category.name ?? "Category unavailable"}</Text><Text style={styles.meta}>{project.ticket?.address}</Text><Text style={styles.meta}>{project.ticket?.ward.name} · {project.agency.name}</Text></View><View style={styles.card}><Text style={styles.kicker}>Inspection report</Text>{project.ticket?.inspectionReports.length ? project.ticket.inspectionReports.map((report) => <View key={report.id}><Text style={styles.bodyText}>{report.notes}</Text><Text style={styles.meta}>{report.contentType}</Text></View>) : <Text style={styles.meta}>No uploaded inspection report.</Text>}</View><View style={styles.card}><Text style={styles.kicker}>Dependencies</Text>{project.dependencies.length ? project.dependencies.map((dependency) => <Text key={dependency.id} style={styles.bodyText}>{dependency.respondingAgency.name}: {dependency.requirement} ({stateLabel(dependency.state as ProjectState)})</Text>) : <Text style={styles.meta}>No dependencies recorded.</Text>}</View>{project.workDescription ? <View style={styles.card}><Text style={styles.kicker}>Execution</Text><Text style={styles.bodyText}>{project.workDescription}</Text><Text style={styles.meta}>{project.plannedStart ? new Date(project.plannedStart).toLocaleDateString() : "—"} – {project.plannedEnd ? new Date(project.plannedEnd).toLocaleDateString() : "—"}</Text></View> : null}{project.editable && project.state === "PENDING_UPTAKE" ? <PrimaryButton onPress={() => void accept()}>Accept / Uptake</PrimaryButton> : null}{project.editable && ["UPTAKEN", "ACTIVE", "MODIFIED"].includes(project.state) ? <SecondaryButton onPress={() => onTimeline(project)}>Edit timeline</SecondaryButton> : null}{project.editable && project.state === "ACTIVE" ? <><TextInput accessibilityLabel="Work note" multiline value={note} onChangeText={setNote} placeholder="Add a field update" placeholderTextColor={colors.muted} style={[styles.input, styles.textarea]}><Text /></TextInput><SecondaryButton onPress={() => void update(false)}>Add work note</SecondaryButton><PrimaryButton onPress={() => void update(true)}>Mark work completed</PrimaryButton></> : null}{project.editable && project.state === "COMPLETED" ? <PrimaryButton onPress={onCompletion}>Add completion evidence</PrimaryButton> : null}{!project.editable ? <Text style={styles.readOnly}>You can view this area project, but only its assigned engineer may edit it.</Text> : null}</ScrollView></Shell>;
}

export function EngineerProjectsApp({ auth, onLogout }: { auth: CurrentAuth; onLogout: () => void }) {
  const [screen, setScreen] = useState<EngineerScreen>("dashboard");
  const [projectId, setProjectId] = useState<string>();
  const [timelineProject, setTimelineProject] = useState<EngineerProjectDetail>();
  const openProject = (id: string) => { setProjectId(id); setScreen("detail"); };
  if (screen === "mine" || screen === "assigned" || screen === "geographic") return <ProjectsScreen scope={screen} auth={auth} onBack={() => setScreen("dashboard")} onOpen={openProject} />;
  if (screen === "dependencies") return <EngineerDependenciesApp currentUserId={auth.userId} onBack={() => setScreen("dashboard")} />;
  if (screen === "detail" && projectId) return <ProjectDetailScreen projectId={projectId} onBack={() => setScreen("dashboard")} onTimeline={(project) => { setTimelineProject(project); setScreen("timeline"); }} onCompletion={() => setScreen("completion")} />;
  if (screen === "timeline" && timelineProject) return <TimelineScreen project={timelineProject} onBack={() => setScreen("detail")} onSaved={() => setScreen("detail")} />;
  if (screen === "completion" && projectId) return <CompletionScreen projectId={projectId} onBack={() => setScreen("detail")} onSubmitted={() => { Alert.alert("Submitted", "The original citizen validators have been notified."); setScreen("detail"); }} />;
  return <Shell><ScrollView contentContainerStyle={styles.content}><View style={styles.headerRow}><View><Text style={styles.kicker}>Executive Engineer</Text><Text style={styles.heading}>Field operations</Text></View><Pressable onPress={onLogout}><Text style={styles.logout}>Sign out</Text></Pressable></View><Text style={styles.intro}>Accept assigned work, set execution timelines, coordinate dependencies, and submit completion evidence.</Text><View style={styles.dashboardGrid}><Pressable onPress={() => setScreen("mine")} style={styles.dashboardCard}><Text style={styles.dashboardIcon}>◷</Text><Text style={styles.cardTitle}>My Projects</Text><Text style={styles.meta}>Ongoing work and updates</Text></Pressable><Pressable onPress={() => setScreen("assigned")} style={styles.dashboardCard}><Text style={styles.dashboardIcon}>↓</Text><Text style={styles.cardTitle}>Assigned Work</Text><Text style={styles.meta}>Uptake queue</Text></Pressable><Pressable onPress={() => setScreen("geographic")} style={styles.dashboardCard}><Text style={styles.dashboardIcon}>⌖</Text><Text style={styles.cardTitle}>Area Projects</Text><Text style={styles.meta}>Filterable list view</Text></Pressable><Pressable onPress={() => setScreen("dependencies")} style={styles.dashboardCard}><Text style={styles.dashboardIcon}>↔</Text><Text style={styles.cardTitle}>Dependencies</Text><Text style={styles.meta}>Agency coordination</Text></Pressable></View></ScrollView></Shell>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 12, padding: 20, paddingTop: 28 },
  content: { flexGrow: 1, gap: 16, padding: 22, paddingTop: 30 },
  loader: { flex: 1 },
  headerRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  heading: { color: colors.ink, fontSize: 32, fontWeight: "900", marginTop: 5 },
  kicker: { color: colors.primary, fontSize: 12, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  intro: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  logout: { color: colors.primary, fontWeight: "800" },
  dashboardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  dashboardCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, gap: 7, minHeight: 150, padding: 17, width: "47%" },
  dashboardIcon: { color: colors.primary, fontSize: 28, fontWeight: "900" },
  list: { gap: 12, paddingBottom: 36 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, gap: 12, padding: 17 },
  cardBody: { gap: 12 },
  cardTop: { alignItems: "flex-start", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  cardHeading: { flex: 1, gap: 5 },
  cardTitle: { color: colors.ink, fontSize: 17, fontWeight: "900" },
  chip: { alignSelf: "flex-start", backgroundColor: colors.primarySoft, borderRadius: 14, color: colors.primary, fontSize: 10, fontWeight: "900", overflow: "hidden", paddingHorizontal: 9, paddingVertical: 6 },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  bodyText: { color: colors.ink, fontSize: 15, lineHeight: 22, marginTop: 7 },
  readOnly: { backgroundColor: "#EEF2F0", borderRadius: 10, color: colors.muted, fontSize: 12, fontWeight: "700", padding: 10 },
  filters: { gap: 8, paddingBottom: 8 },
  filter: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 8 },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  filterTextActive: { color: "white", fontSize: 12, fontWeight: "800" },
  empty: { color: colors.muted, paddingVertical: 40, textAlign: "center" },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.ink, fontSize: 16, paddingHorizontal: 15, paddingVertical: 13 },
  textarea: { minHeight: 110, textAlignVertical: "top" },
  label: { color: colors.ink, fontSize: 13, fontWeight: "800", marginBottom: -10 },
  error: { color: colors.danger, fontSize: 14 },
  demo: { color: colors.muted, fontSize: 12, textAlign: "center" },
  photo: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderStyle: "dashed", borderWidth: 2, height: 280, justifyContent: "center", overflow: "hidden" },
  photoImage: { height: "100%", width: "100%" },
  photoPrompt: { color: colors.primary, fontSize: 17, fontWeight: "900" },
});
