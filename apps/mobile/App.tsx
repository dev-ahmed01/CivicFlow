import { useCallback, useEffect, useState } from "react";
import type { CategorySummary, CitizenTicketSummary, CitizenTicketTimelineResponse, CompletionVerificationDecision, PendingCompletionVerification, PendingValidation, ValidationVote } from "@civicos/shared";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { loadCategories, loadCurrentAuth, loadMyTickets, loadNotifications, loadPendingCompletionVerifications, loadPendingValidations, loadTicket, logoutSession, submitReport, updateCitizenLocation, validateTicket, verifyCompletion, type CurrentAuth, type DraftReport, type LocalImage, type MobileNotification } from "./src/api";
import { EngineerLoginScreen, EngineerProjectsApp } from "./src/engineer-projects";
import { CategoryScreen, CitizenLoginScreen, CitizenProfileScreen, CompletionVerificationListScreen, CompletionVerificationScreen, ConfirmationScreen, EvidenceScreen, HomeScreen, LocationScreen, RetakeScreen, Shell, TicketDetailScreen, TicketsScreen, VerificationListScreen, VerificationRequestScreen, type ConfirmedLocation } from "./src/screens";
import { colors } from "./src/theme";
import { NotificationsScreen } from "./src/notifications";
import { registerForPushNotifications, subscribeToPushNavigation } from "./src/push-notifications";
import { DesignSystemProvider, MobileTabBar, type MobileTab } from "./src/components";

type Screen = "home" | "citizen-login" | "category" | "evidence" | "location" | "feedback" | "confirmation" | "detail" | "tickets" | "validations" | "verification" | "completion-validations" | "completion-verification" | "notifications" | "profile" | "engineer-login";

export default function App() {
  const [viewerRole, setViewerRole] = useState<"ENGINEER" | "OTHER" | "LOADING">("LOADING");
  const [engineerAuth, setEngineerAuth] = useState<CurrentAuth>();
  const [citizenAuth, setCitizenAuth] = useState<CurrentAuth>();
  const [notificationUnread, setNotificationUnread] = useState(0);
  const [screen, setScreen] = useState<Screen>("home");
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [categoryError, setCategoryError] = useState<string>();
  const [selectedCategory, setSelectedCategory] = useState<CategorySummary>();
  const [images, setImages] = useState<LocalImage[]>([]);
  const [location, setLocation] = useState<ConfirmedLocation>();
  const [draftTicketId, setDraftTicketId] = useState<string>();
  const [feedback, setFeedback] = useState({ message: "", attemptsRemaining: 0 });
  const [submitted, setSubmitted] = useState<CitizenTicketSummary>();
  const [ticketTimeline, setTicketTimeline] = useState<CitizenTicketTimelineResponse>();
  const [ticketDetailLoading, setTicketDetailLoading] = useState(false);
  const [ticketDetailError, setTicketDetailError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [ticketFilter, setTicketFilter] = useState<"ongoing" | "past">("ongoing");
  const [tickets, setTickets] = useState<CitizenTicketSummary[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState<string>();
  const [validations, setValidations] = useState<PendingValidation[]>([]);
  const [selectedValidation, setSelectedValidation] = useState<PendingValidation>();
  const [validationsLoading, setValidationsLoading] = useState(false);
  const [validationsError, setValidationsError] = useState<string>();
  const [validationSubmitting, setValidationSubmitting] = useState(false);
  const [completionValidations, setCompletionValidations] = useState<PendingCompletionVerification[]>([]);
  const [selectedCompletion, setSelectedCompletion] = useState<PendingCompletionVerification>();
  const [completionLoading, setCompletionLoading] = useState(false);
  const [completionError, setCompletionError] = useState<string>();
  const [completionSubmitting, setCompletionSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const auth = await loadCurrentAuth();
        if (auth.role === "ENGINEER") { setEngineerAuth(auth); setViewerRole("ENGINEER"); return; }
        if (auth.role === "CITIZEN") setCitizenAuth(auth);
      } catch { /* Public/citizen startup continues without an internal role. */ }
      setViewerRole("OTHER");
      try { setCategories(await loadCategories()); }
      catch (error) { setCategoryError(error instanceof Error ? error.message : "Could not load issue types"); }
    })();
  }, []);

  useEffect(() => {
    if (!citizenAuth) return;
    void registerForPushNotifications().catch(() => { /* In-app notifications remain available if push permission is denied. */ });
    void (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return;
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await updateCitizenLocation(position.coords.latitude, position.coords.longitude);
    })().catch(() => { /* Reporting still captures location; nearby validation waits for the next sync. */ });
    let active = true;
    const poll = () => { void loadNotifications(true).then((result) => { if (active) setNotificationUnread(result.unreadCount); }).catch(() => undefined); };
    poll();
    const timer = setInterval(poll, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, [citizenAuth]);

  useEffect(() => {
    if (!citizenAuth || viewerRole !== "OTHER") return;
    return subscribeToPushNavigation((data) => {
      if (data.type === "VALIDATION_REQUEST") { setScreen("validations"); return; }
      if (data.type === "COMPLETION_VERIFICATION_REQUEST") { setScreen("completion-validations"); return; }
      if (typeof data.ticketId !== "string") return;
      setTicketDetailLoading(true); setTicketDetailError(undefined);
      void loadTicket(data.ticketId).then((result) => { setSubmitted(result.ticket); setTicketTimeline({ timeline: result.timeline, notes: result.notes }); setScreen("detail"); }).catch((error: unknown) => { const message = error instanceof Error ? error.message : "Could not open this ticket"; setTicketDetailError(message); Alert.alert("Couldn't open update", message); }).finally(() => setTicketDetailLoading(false));
    });
  }, [citizenAuth, viewerRole]);

  if (viewerRole === "ENGINEER" && engineerAuth) return <DesignSystemProvider theme="internal"><StatusBar style="dark" /><EngineerProjectsApp auth={engineerAuth} onLogout={() => { void logoutSession(); setEngineerAuth(undefined); setViewerRole("OTHER"); setScreen("home"); }} /></DesignSystemProvider>;
  if (viewerRole === "LOADING") return <DesignSystemProvider theme="citizen"><StatusBar style="dark" /><Shell><View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.loadingText}>Loading CivicOS…</Text></View></Shell></DesignSystemProvider>;

  const updateLocation = useCallback((next: ConfirmedLocation) => setLocation(next), []);
  const reset = () => {
    setScreen("home"); setSelectedCategory(undefined); setImages([]); setLocation(undefined); setDraftTicketId(undefined); setSubmitted(undefined); setTicketTimeline(undefined); setTicketDetailError(undefined);
  };
  const openTickets = (filter: "ongoing" | "past") => {
    setTicketFilter(filter); setScreen("tickets"); setTicketsLoading(true); setTicketsError(undefined);
    void loadMyTickets(filter).then(setTickets).catch((error: unknown) => setTicketsError(error instanceof Error ? error.message : "Could not load tickets")).finally(() => setTicketsLoading(false));
  };
  const openValidations = () => {
    setScreen("validations"); setValidationsLoading(true); setValidationsError(undefined);
    void loadPendingValidations().then(setValidations).catch((error: unknown) => setValidationsError(error instanceof Error ? error.message : "Could not load nearby requests")).finally(() => setValidationsLoading(false));
  };
  const refreshTicket = async (ticketId: string) => {
    setTicketDetailLoading(true); setTicketDetailError(undefined);
    try { const result = await loadTicket(ticketId); setSubmitted(result.ticket); setTicketTimeline({ timeline: result.timeline, notes: result.notes }); }
    catch (error) { setTicketDetailError(error instanceof Error ? error.message : "Could not refresh this ticket"); }
    finally { setTicketDetailLoading(false); }
  };
  const openTicket = (ticket: CitizenTicketSummary) => {
    setSubmitted(ticket); setTicketTimeline(undefined); setScreen("detail"); void refreshTicket(ticket.id);
  };
  const openCompletionValidations = () => {
    setScreen("completion-validations"); setCompletionLoading(true); setCompletionError(undefined);
    void loadPendingCompletionVerifications().then(setCompletionValidations).catch((error: unknown) => setCompletionError(error instanceof Error ? error.message : "Could not load completion checks")).finally(() => setCompletionLoading(false));
  };
  const openNotification = (notification: MobileNotification) => {
    if (notification.type === "VALIDATION_REQUEST") { openValidations(); return; }
    if (notification.type === "COMPLETION_VERIFICATION_REQUEST") { openCompletionValidations(); return; }
    const ticketId = typeof notification.payload.ticketId === "string" ? notification.payload.ticketId : undefined;
    if (ticketId) { setTicketDetailLoading(true); setTicketDetailError(undefined); void loadTicket(ticketId).then((result) => { setSubmitted(result.ticket); setTicketTimeline({ timeline: result.timeline, notes: result.notes }); setScreen("detail"); }).catch((error: unknown) => { const message = error instanceof Error ? error.message : "Could not open this ticket"; setTicketDetailError(message); Alert.alert("Couldn't open update", message); }).finally(() => setTicketDetailLoading(false)); return; }
    openTickets(notification.type === "TICKET_RESOLVED" ? "past" : "ongoing");
  };
  const submitValidationVote = async (vote: ValidationVote) => {
    if (!selectedValidation) return;
    setValidationSubmitting(true);
    try {
      const result = await validateTicket(selectedValidation.ticketId, vote);
      Alert.alert(result.alreadyResolved ? "Already reviewed" : "Thanks for checking", result.alreadyResolved ? "This request was already resolved. Your response was still recorded." : "Your response has been recorded.");
      setValidations((current) => current.filter((item) => item.ticketId !== selectedValidation.ticketId));
      setSelectedValidation(undefined); setScreen("validations");
    } catch (error) { Alert.alert("Couldn’t record response", error instanceof Error ? error.message : "Please try again."); }
    finally { setValidationSubmitting(false); }
  };
  const submitCompletionVote = async (decision: CompletionVerificationDecision) => {
    if (!selectedCompletion) return;
    setCompletionSubmitting(true);
    try {
      await verifyCompletion(selectedCompletion.evidenceId, decision);
      Alert.alert(decision === "VERIFIED" ? "Completion verified" : "Rework requested", "Your response has been recorded.");
      setCompletionValidations((current) => current.filter((item) => item.evidenceId !== selectedCompletion.evidenceId));
      setSelectedCompletion(undefined); setScreen("completion-validations");
    } catch (error) { Alert.alert("Couldn't record response", error instanceof Error ? error.message : "Please try again."); }
    finally { setCompletionSubmitting(false); }
  };
  const completeSubmission = async () => {
    if (!selectedCategory || !images[0] || !location) return;
    setSubmitting(true);
    const report: DraftReport = { categoryId: selectedCategory.id, title: `${selectedCategory.name} near ${location.address.split(",")[0]}`, address: location.address, latitude: location.latitude, longitude: location.longitude };
    try {
      const result = await submitReport(report, images[0], images.slice(1), draftTicketId);
      if (result.needsRetake) { setDraftTicketId(result.ticketId); setFeedback(result); setScreen("feedback"); }
      else { setSubmitted(result.ticket); setDraftTicketId(undefined); setScreen("confirmation"); }
    } catch (error) { Alert.alert("Couldn’t submit report", error instanceof Error ? error.message : "Please try again."); }
    finally { setSubmitting(false); }
  };

  let content;
  if (submitting) content = <Shell><View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.loadingText}>Sending your report…</Text></View></Shell>;
  else if (screen === "category") content = <CategoryScreen categories={categories} loading={!categoryError && categories.length === 0} error={categoryError} selectedId={selectedCategory?.id} onBack={() => setScreen("home")} onSelect={(category) => { setSelectedCategory(category); setScreen("evidence"); }} />;
  else if (screen === "evidence") content = <EvidenceScreen images={images} onChange={setImages} onBack={() => setScreen("category")} onNext={() => setScreen("location")} />;
  else if (screen === "location") content = <LocationScreen value={location} onChange={updateLocation} onBack={() => setScreen("evidence")} onNext={() => void completeSubmission()} />;
  else if (screen === "feedback") content = <RetakeScreen {...feedback} onRetake={() => { setImages([]); setScreen("evidence"); }} />;
  else if (screen === "confirmation" && submitted) content = <ConfirmationScreen ticket={submitted} onView={() => openTicket(submitted)} onDone={reset} />;
  else if (screen === "detail" && submitted) content = <TicketDetailScreen ticket={submitted} timeline={ticketTimeline} loading={ticketDetailLoading} error={ticketDetailError} onRefresh={() => void refreshTicket(submitted.id)} onDone={reset} />;
  else if (screen === "tickets") content = <TicketsScreen filter={ticketFilter} tickets={tickets} loading={ticketsLoading} error={ticketsError} onBack={() => setScreen("home")} onOpen={openTicket} />;
  else if (screen === "validations") content = <VerificationListScreen validations={validations} loading={validationsLoading} error={validationsError} onBack={() => setScreen("home")} onOpen={(validation) => { setSelectedValidation(validation); setScreen("verification"); }} />;
  else if (screen === "verification" && selectedValidation) content = <VerificationRequestScreen validation={selectedValidation} submitting={validationSubmitting} onBack={() => setScreen("validations")} onSubmit={(vote) => void submitValidationVote(vote)} />;
  else if (screen === "completion-validations") content = <CompletionVerificationListScreen completions={completionValidations} loading={completionLoading} error={completionError} onBack={() => setScreen("home")} onOpen={(completion) => { setSelectedCompletion(completion); setScreen("completion-verification"); }} />;
  else if (screen === "completion-verification" && selectedCompletion) content = <CompletionVerificationScreen completion={selectedCompletion} submitting={completionSubmitting} onBack={() => setScreen("completion-validations")} onSubmit={(decision) => void submitCompletionVote(decision)} />;
  else if (screen === "notifications") content = <NotificationsScreen role="CITIZEN" onBack={() => setScreen("home")} onOpen={openNotification} onViewed={() => setNotificationUnread(0)} />;
  else if (screen === "profile") content = <CitizenProfileScreen signedIn={Boolean(citizenAuth)} onSignIn={() => setScreen("citizen-login")} onSignOut={() => { void logoutSession(); setCitizenAuth(undefined); setScreen("home"); }} />;
  else if (screen === "citizen-login") content = <CitizenLoginScreen onAuthenticated={(auth) => { setCitizenAuth(auth); setScreen("home"); }} onBack={() => setScreen("home")} />;
  else if (screen === "engineer-login") content = <EngineerLoginScreen onCancel={() => setScreen("home")} onLogin={(auth) => { setEngineerAuth(auth); setViewerRole("ENGINEER"); }} />;
  else content = <HomeScreen signedIn={Boolean(citizenAuth)} onSignIn={() => setScreen("citizen-login")} onReport={() => citizenAuth ? setScreen("category") : setScreen("citizen-login")} onTickets={(filter) => citizenAuth ? openTickets(filter) : setScreen("citizen-login")} onValidations={() => citizenAuth ? openValidations() : setScreen("citizen-login")} onCompletionValidations={() => citizenAuth ? openCompletionValidations() : setScreen("citizen-login")} onEngineerLogin={() => setScreen("engineer-login")} />;

  const tabs: MobileTab[] = [
    { id: "home", label: "Home", icon: "⌂" },
    { id: "report", label: "Report", icon: "+" },
    { id: "tickets", label: "My tickets", icon: "□" },
    { id: "notifications", label: notificationUnread ? `Updates ${notificationUnread}` : "Updates", icon: "◇" },
    { id: "profile", label: "Profile", icon: "○" },
  ];
  const activeTab = screen === "home" ? "home" : ["category", "evidence", "location", "feedback", "confirmation"].includes(screen) ? "report" : ["tickets", "detail"].includes(screen) ? "tickets" : ["validations", "verification", "completion-validations", "completion-verification", "notifications"].includes(screen) ? "notifications" : screen === "profile" ? "profile" : "home";
  const selectTab = (id: string) => {
    if (id === "home") setScreen("home");
    else if (id === "profile") setScreen("profile");
    else if (!citizenAuth) setScreen("citizen-login");
    else if (id === "report") setScreen("category");
    else if (id === "tickets") openTickets("ongoing");
    else if (id === "notifications") setScreen("notifications");
  };
  return <DesignSystemProvider theme="citizen"><StatusBar style="dark" /><View style={styles.app}><View style={styles.stage}>{content}</View><View style={styles.tabInset}><MobileTabBar active={activeTab} items={tabs} onSelect={selectTab} /></View></View></DesignSystemProvider>;
}

const styles = StyleSheet.create({ app: { backgroundColor: colors.canvas, flex: 1 }, stage: { flex: 1 }, tabInset: { backgroundColor: colors.canvas, paddingBottom: 8, paddingHorizontal: 12 }, loading: { alignItems: "center", flex: 1, gap: 16, justifyContent: "center" }, loadingText: { color: colors.ink, fontSize: 16, fontWeight: "500" } });
