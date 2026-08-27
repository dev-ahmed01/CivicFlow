import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { EngineerProjectDetail, ProjectConflict, ProjectListItem, ProjectState } from "@civicos/shared";
import * as ImagePicker from "expo-image-picker";
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  internalLogin,
  loadAgencies,
  loadEngineerProject,
  loadEngineerProjects,
  loadNotifications,
  resetInternalPassword,
  submitCompletionEvidence,
  uptakeProject,
  updateProjectStatus,
  updateProjectTimeline,
  type CurrentAuth,
  type LocalImage,
  type MobileNotification,
} from "./api";
import { MobileTabBar, PrimaryButton, ScreenHeader, SecondaryButton, TicketCard, type MobileTab } from "./components";
import { EngineerDependenciesApp } from "./engineer-dependencies";
import { Shell } from "./screens";
import { internal as colors } from "./theme";
import { NotificationsScreen } from "./notifications";
import { registerForPushNotifications, subscribeToPushNavigation } from "./push-notifications";

type EngineerScreen = "dashboard" | "mine" | "assigned" | "detail" | "timeline" | "geographic" | "completion" | "dependencies" | "notifications" | "profile";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Please try again.";
}

function stateLabel(state: string): string {
  const label = state.replaceAll("_", " ").toLowerCase();
  return `${label[0]?.toUpperCase()}${label.slice(1)}`;
}

function daysRemaining(end: string | Date | null): string {
  if (!end) return "Timeline not set";
  const days = Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)} days overdue`;
  return days === 1 ? "1 day remaining" : `${days} days remaining`;
}

export function EngineerLoginScreen({ onLogin, onCancel }: { onLogin: (auth: CurrentAuth) => void; onCancel: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetRequired, setResetRequired] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const auth = await internalLogin(email.trim().toLowerCase(), password);
      if (auth.mustResetPassword) { setResetRequired(true); return; }
      onLogin(auth);
    }
    catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); }
  };
  const reset = async () => {
    if (newPassword !== confirmPassword) { setError("New passwords do not match"); return; }
    setBusy(true); setError(undefined);
    try { await resetInternalPassword(password, newPassword); setResetRequired(false); setPassword(""); setNewPassword(""); setConfirmPassword(""); Alert.alert("Password updated", "Sign in with your new password."); }
    catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); }
  };
  return <Shell><ScrollView contentContainerStyle={styles.content}><ScreenHeader eyebrow="Executive Engineer" title={resetRequired ? "Choose a new password" : "Sign in to field operations"} onBack={resetRequired ? () => setResetRequired(false) : onCancel} /><Text style={styles.intro}>{resetRequired ? "This account uses a temporary password. Set a new password before continuing." : "Your role and agency scope are detected from your account after sign-in."}</Text>{resetRequired ? <><TextInput accessibilityLabel="New password" secureTextEntry value={newPassword} onChangeText={setNewPassword} placeholder="At least 12 characters" placeholderTextColor={colors.muted} style={styles.input} /><TextInput accessibilityLabel="Confirm new password" secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm new password" placeholderTextColor={colors.muted} style={styles.input} /></> : <><TextInput accessibilityLabel="Work email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="Work email" placeholderTextColor={colors.muted} style={styles.input} /><TextInput accessibilityLabel="Password" secureTextEntry value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={colors.muted} style={styles.input} /></>}{error ? <Text style={styles.error}>{error}</Text> : null}<PrimaryButton disabled={busy || (resetRequired ? newPassword.length < 12 || confirmPassword.length < 12 : !email || !password)} onPress={() => void (resetRequired ? reset() : submit())}>{busy ? "Please wait…" : resetRequired ? "Set new password" : "Sign in"}</PrimaryButton></ScrollView></Shell>;
}

function ProjectCard({ project, canEdit, onOpen, onAccept }: { project: ProjectListItem; canEdit: boolean; onOpen: () => void; onAccept?: () => void }) {
  const indicators = [project.ticket?.ward.name ?? "Ward unavailable", project.dependencyCount ? `${project.dependencyCount} dependencies` : undefined, project.grievance ? "Grievance open" : undefined, canEdit ? undefined : "Read-only"].filter(Boolean).join(" · ");
  return <TicketCard id={project.ticket?.id ?? project.id} category={project.agency.name} status={project.state} relativeDate={daysRemaining(project.plannedEnd)} title={project.ticket?.title ?? "Standalone project"} meta={indicators} onPress={onOpen} action={onAccept ? <PrimaryButton onPress={onAccept}>Accept</PrimaryButton> : undefined} />;
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
  const [conflicts, setConflicts] = useState<ProjectConflict[]>([]);
  const submit = async () => {
    setBusy(true);
    try {
      const warnings = await updateProjectTimeline(project.id, { plannedStart: `${start}T00:00:00.000Z`, plannedEnd: `${end}T23:59:59.999Z`, workDescription: description, dependencyFlags: flags.split(",").map((item) => item.trim()).filter(Boolean) });
      if (warnings.length > 0) setConflicts(warnings);
      else onSaved();
    } catch (caught) { Alert.alert("Couldn't save execution details", errorMessage(caught)); }
    finally { setBusy(false); }
  };
  const continueAnyway = () => { setConflicts([]); onSaved(); };
  return <Shell><ScrollView contentContainerStyle={styles.content}><ScreenHeader eyebrow="Set timeline" title="Execution details" onBack={onBack} /><Text style={styles.intro}>Date fields use YYYY-MM-DD. Saving runs the advisory conflict check and activates the project.</Text><Text style={styles.label}>Start date</Text><TextInput accessibilityLabel="Planned start date" value={start} onChangeText={setStart} placeholder="YYYY-MM-DD" style={styles.input} /><Text style={styles.label}>End date</Text><TextInput accessibilityLabel="Planned end date" value={end} onChangeText={setEnd} placeholder="YYYY-MM-DD" style={styles.input} /><Text style={styles.label}>Work description</Text><TextInput accessibilityLabel="Work description" multiline value={description} onChangeText={setDescription} style={[styles.input, styles.textarea]} /><Text style={styles.label}>Dependency flags</Text><TextInput accessibilityLabel="Dependency flags" value={flags} onChangeText={setFlags} placeholder="Traffic diversion, utility clearance" style={styles.input} /><PrimaryButton disabled={busy || description.trim().length < 10} onPress={() => void submit()}>{busy ? "Checking conflicts…" : "Save timeline & activate"}</PrimaryButton></ScrollView><Modal animationType="slide" onRequestClose={continueAnyway} transparent visible={conflicts.length > 0}><View style={styles.conflictBackdrop}><View accessibilityLabel="Advisory conflict warning" accessibilityRole="alert" style={styles.conflictSheet}><Text style={styles.kicker}>Advisory conflict check</Text><Text style={styles.conflictTitle}>{conflicts.length} timeline {conflicts.length === 1 ? "warning" : "warnings"}</Text><Text style={styles.conflictIntro}>Your timeline is saved and remains editable. Coordinate with the other agencies as needed.</Text><ScrollView contentContainerStyle={styles.conflictList}>{conflicts.map((conflict) => <View key={conflict.id} style={[styles.conflictItem, conflict.severity === "PROMINENT" && styles.conflictProminent]}><Text style={styles.conflictSeverity}>{conflict.severity === "PROMINENT" ? "Prominent warning" : "Inline note"}</Text><Text style={styles.cardTitle}>{conflict.conflictingProjectName}</Text><Text style={styles.bodyText}>{conflict.conflictingAgency.name}</Text><Text style={styles.meta}>{new Date(conflict.overlapStart).toLocaleDateString("en-IN")} – {new Date(conflict.overlapEnd).toLocaleDateString("en-IN")}</Text><Text style={styles.meta}>{conflict.locationDescription}</Text></View>)}</ScrollView><PrimaryButton onPress={continueAnyway}>Continue Anyway</PrimaryButton></View></View></Modal></Shell>;
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

function EngineerProfileScreen({ auth, onLogout }: { auth: CurrentAuth; onLogout: () => void }) {
  return <Shell><ScrollView contentContainerStyle={styles.content}><ScreenHeader eyebrow="Account" title="Engineer profile" /><View style={styles.card}><Text style={styles.kicker}>Role</Text><Text style={styles.cardTitle}>Executive Engineer</Text><Text style={styles.meta}>Agency scope {auth.agencyId ?? "Unavailable"}</Text><Text style={styles.meta}>User {auth.userId.slice(0, 8)}</Text></View><View style={styles.card}><Text style={styles.kicker}>Access</Text><Text style={styles.bodyText}>Project editing is limited to work assigned to you within your agency. Geographic projects remain read-only.</Text></View><SecondaryButton onPress={onLogout}>Sign out</SecondaryButton></ScrollView></Shell>;
}

export function EngineerProjectsApp({ auth, onLogout }: { auth: CurrentAuth; onLogout: () => void }) {
  const [screen, setScreen] = useState<EngineerScreen>("dashboard");
  const [projectId, setProjectId] = useState<string>();
  const [timelineProject, setTimelineProject] = useState<EngineerProjectDetail>();
  const [notificationUnread, setNotificationUnread] = useState(0);
  useEffect(() => {
    void registerForPushNotifications().catch(() => { /* In-app center remains available. */ });
    let active = true;
    const poll = () => { void loadNotifications(true).then((result) => { if (active) setNotificationUnread(result.unreadCount); }).catch(() => undefined); };
    poll();
    const timer = setInterval(poll, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, [auth.userId]);
  const openProject = (id: string) => { setProjectId(id); setScreen("detail"); };
  const openNotification = (notification: MobileNotification) => {
    const nextProjectId = typeof notification.payload.projectId === "string" ? notification.payload.projectId : undefined;
    if (nextProjectId) { openProject(nextProjectId); return; }
    if (typeof notification.payload.dependencyId === "string") { setScreen("dependencies"); return; }
    setScreen("dashboard");
  };
  useEffect(() => subscribeToPushNavigation((data) => {
    if (typeof data.projectId === "string") { openProject(data.projectId); return; }
    if (typeof data.dependencyId === "string") setScreen("dependencies");
  }), []);
  const tabs: MobileTab[] = [{ id: "dashboard", label: "Home", icon: "home-outline", activeIcon: "home" }, { id: "mine", label: "Work", icon: "construct-outline", activeIcon: "construct" }, { id: "geographic", label: "Area", icon: "map-outline", activeIcon: "map" }, { id: "notifications", label: "Updates", icon: "notifications-outline", activeIcon: "notifications", badge: notificationUnread }, { id: "profile", label: "Profile", icon: "person-outline", activeIcon: "person" }];
  const activeTab = ["mine", "assigned", "detail", "timeline", "completion", "dependencies"].includes(screen) ? "mine" : screen;
  const withNavigation = (content: ReactNode) => <View style={styles.app}><View style={styles.stage}>{content}</View><View style={styles.tabInset}><MobileTabBar active={activeTab} items={tabs} onSelect={(id) => setScreen(id as EngineerScreen)} /></View></View>;
  if (screen === "mine" || screen === "assigned" || screen === "geographic") return withNavigation(<ProjectsScreen scope={screen} auth={auth} onBack={() => setScreen("dashboard")} onOpen={openProject} />);
  if (screen === "dependencies") return withNavigation(<EngineerDependenciesApp currentUserId={auth.userId} onBack={() => setScreen("dashboard")} />);
  if (screen === "notifications") return withNavigation(<NotificationsScreen role="ENGINEER" onBack={() => setScreen("dashboard")} onOpen={openNotification} onViewed={() => setNotificationUnread(0)} />);
  if (screen === "profile") return withNavigation(<EngineerProfileScreen auth={auth} onLogout={onLogout} />);
  if (screen === "detail" && projectId) return withNavigation(<ProjectDetailScreen projectId={projectId} onBack={() => setScreen("dashboard")} onTimeline={(project) => { setTimelineProject(project); setScreen("timeline"); }} onCompletion={() => setScreen("completion")} />);
  if (screen === "timeline" && timelineProject) return withNavigation(<TimelineScreen project={timelineProject} onBack={() => setScreen("detail")} onSaved={() => setScreen("detail")} />);
  if (screen === "completion" && projectId) return withNavigation(<CompletionScreen projectId={projectId} onBack={() => setScreen("detail")} onSubmitted={() => { Alert.alert("Submitted", "The original citizen validators have been notified."); setScreen("detail"); }} />);
  return withNavigation(<Shell><ScrollView contentContainerStyle={styles.content}><View style={styles.headerRow}><View><Text style={styles.kicker}>Executive Engineer</Text><Text style={styles.heading}>Field operations</Text></View><Pressable onPress={onLogout}><Text style={styles.logout}>Sign out</Text></Pressable></View><Text style={styles.intro}>Accept assigned work, set execution timelines, coordinate dependencies, and submit completion evidence.</Text><View style={styles.dashboardGrid}><Pressable onPress={() => setScreen("mine")} style={styles.dashboardCard}><Text style={styles.dashboardIcon}>◷</Text><Text style={styles.cardTitle}>My projects</Text><Text style={styles.meta}>Ongoing work and updates</Text></Pressable><Pressable onPress={() => setScreen("assigned")} style={styles.dashboardCard}><Text style={styles.dashboardIcon}>↓</Text><Text style={styles.cardTitle}>Assigned work</Text><Text style={styles.meta}>Uptake queue</Text></Pressable><Pressable onPress={() => setScreen("geographic")} style={styles.dashboardCard}><Text style={styles.dashboardIcon}>⌖</Text><Text style={styles.cardTitle}>Area projects</Text><Text style={styles.meta}>Filterable list view</Text></Pressable><Pressable onPress={() => setScreen("dependencies")} style={styles.dashboardCard}><Text style={styles.dashboardIcon}>↔</Text><Text style={styles.cardTitle}>Dependencies</Text><Text style={styles.meta}>Agency coordination</Text></Pressable><Pressable onPress={() => setScreen("notifications")} style={styles.dashboardCard}><Text style={styles.dashboardIcon}>♢</Text><Text style={styles.cardTitle}>Notifications{notificationUnread > 0 ? ` (${notificationUnread})` : ""}</Text><Text style={styles.meta}>Assignments, conflicts, and completion</Text></Pressable></View></ScrollView></Shell>);
}

const styles = StyleSheet.create({
  app: { backgroundColor: colors.canvas, flex: 1 }, stage: { flex: 1 }, tabInset: { backgroundColor: colors.canvas, paddingBottom: 8, paddingHorizontal: 12 },
  screen: { flex: 1, gap: 12, padding: 20, paddingTop: 28 },
  content: { flexGrow: 1, gap: 16, padding: 22, paddingTop: 30 },
  loader: { flex: 1 },
  headerRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  heading: { color: colors.ink, fontSize: 22, fontWeight: "500", marginTop: 5 },
  kicker: { color: colors.primary, fontSize: 12, fontWeight: "500" },
  intro: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  logout: { color: colors.primary, fontWeight: "500" },
  dashboardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  dashboardCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: 7, minHeight: 140, padding: 17, width: "47%" },
  dashboardIcon: { color: colors.primary, fontSize: 22, fontWeight: "500" },
  list: { gap: 12, paddingBottom: 36 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: 12, padding: 17 },
  cardBody: { gap: 12 },
  cardTop: { alignItems: "flex-start", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  cardHeading: { flex: 1, gap: 5 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "500" },
  chip: { alignSelf: "flex-start", backgroundColor: colors.infoBg, borderRadius: 20, color: colors.infoText, fontSize: 12, fontWeight: "500", overflow: "hidden", paddingHorizontal: 9, paddingVertical: 6 },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  bodyText: { color: colors.ink, fontSize: 15, lineHeight: 22, marginTop: 7 },
  readOnly: { backgroundColor: colors.surfaceAlt, borderRadius: 10, color: colors.muted, fontSize: 12, fontWeight: "500", padding: 10 },
  filters: { gap: 8, paddingBottom: 8 },
  filter: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 8 },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: "500" },
  filterTextActive: { color: colors.surface, fontSize: 12, fontWeight: "500" },
  empty: { color: colors.muted, paddingVertical: 40, textAlign: "center" },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.ink, fontSize: 16, paddingHorizontal: 15, paddingVertical: 13 },
  textarea: { minHeight: 110, textAlignVertical: "top" },
  label: { color: colors.ink, fontSize: 14, fontWeight: "500", marginBottom: -10 },
  error: { color: colors.danger, fontSize: 14 },
  demo: { color: colors.muted, fontSize: 12, textAlign: "center" },
  photo: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderStyle: "dashed", borderWidth: 2, height: 280, justifyContent: "center", overflow: "hidden" },
  photoImage: { height: "100%", width: "100%" },
  photoPrompt: { color: colors.primary, fontSize: 16, fontWeight: "500" },
  conflictBackdrop: { backgroundColor: colors.overlay, flex: 1, justifyContent: "flex-end" },
  conflictSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, gap: 14, maxHeight: "82%", padding: 22, paddingBottom: 30 },
  conflictTitle: { color: colors.ink, fontSize: 22, fontWeight: "500" },
  conflictIntro: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  conflictList: { gap: 10 },
  conflictItem: { backgroundColor: colors.warningBg, borderColor: colors.warningText, borderLeftColor: colors.warningText, borderLeftWidth: 4, borderRadius: 12, borderWidth: 1, gap: 5, padding: 14 },
  conflictProminent: { borderLeftColor: colors.warningText, borderLeftWidth: 8 },
  conflictSeverity: { color: colors.warningText, fontSize: 12, fontWeight: "500" },
});
