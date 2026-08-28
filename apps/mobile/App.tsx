import { useCallback, useEffect, useState } from "react";
import type { CategorySummary, CitizenGrievanceReason, CitizenTicketDetail, CitizenTicketSummary, CitizenTicketTimelineResponse, CompletionVerificationDecision, PendingCompletionVerification, PendingValidation, ValidationVote } from "@civicos/shared";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import { ActivityIndicator, Alert, AppState, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { loadCategories, loadCurrentAuth, loadMyTickets, loadNotifications, loadPendingCompletionVerifications, loadPendingValidations, loadTicket, logoutSession, raiseCitizenGrievance, submitReport, updateCitizenLocation, validateReportImage, validateTicket, verifyCompletion, type CurrentAuth, type DraftReport, type LocalImage, type MobileNotification } from "./src/api";
import { EngineerLoginScreen, EngineerProjectsApp } from "./src/engineer-projects";
import { CategoryScreen, CitizenLoginScreen, CitizenProfileScreen, CompletionVerificationListScreen, CompletionVerificationScreen, ConfirmationScreen, EvidenceScreen, GrievanceScreen, HomeScreen, LocationConfirmScreen, LocationDetectScreen, RetakeScreen, ReviewReportScreen, Shell, SplashScreen, TicketDetailScreen, TicketsScreen, VerificationListScreen, VerificationRequestScreen, WelcomeScreen, type CitizenHomeSummary, type ConfirmedLocation } from "./src/screens";
import { NotificationsScreen } from "./src/notifications";
import { registerForPushNotifications, subscribeToPushNavigation, subscribeToPushReceipt } from "./src/push-notifications";
import { DesignSystemProvider, MobileTabBar, type MobileTab } from "./src/components";
import { colors } from "./src/theme";
import { nextScreenAfterPhotoCheck, photoRejectionMessage } from "./src/photo-flow";

type Viewer = "LOADING" | "SIGNED_OUT" | "CITIZEN" | "ENGINEER";
type Screen = "welcome" | "citizen-login" | "engineer-login" | "home" | "category" | "evidence" | "location-detect" | "location-confirm" | "review" | "feedback" | "confirmation" | "detail" | "grievance" | "tickets" | "validations" | "verification" | "completion-validations" | "completion-verification" | "notifications" | "profile";

const emptyHomeSummary: CitizenHomeSummary = { pendingValidations: 0, pendingCompletions: 0, ongoingReports: 0, resolvedReports: 0, recentNotifications: [] };

export default function App() {
  return <SafeAreaProvider><AppContent /></SafeAreaProvider>;
}

function AppContent() {
  const [viewer, setViewer] = useState<Viewer>("LOADING");
  const [engineerAuth, setEngineerAuth] = useState<CurrentAuth>();
  const [citizenAuth, setCitizenAuth] = useState<CurrentAuth>();
  const [screen, setScreen] = useState<Screen>("welcome");
  const [notificationUnread, setNotificationUnread] = useState(0);
  const [homeSummary, setHomeSummary] = useState<CitizenHomeSummary>(emptyHomeSummary);
  const [homeLoading, setHomeLoading] = useState(false);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [categoryError, setCategoryError] = useState<string>();
  const [selectedCategory, setSelectedCategory] = useState<CategorySummary>();
  const [images, setImages] = useState<LocalImage[]>([]);
  const [location, setLocation] = useState<ConfirmedLocation>();
  const [draftTicketId, setDraftTicketId] = useState<string>();
  const [feedback, setFeedback] = useState({ message: "", attemptsRemaining: 0 });
  const [imageValidationToken, setImageValidationToken] = useState<string>();
  const [imageChecking, setImageChecking] = useState(false);
  const [imageCheckError, setImageCheckError] = useState<string>();
  const [photoAttempt, setPhotoAttempt] = useState(0);
  const [submitted, setSubmitted] = useState<CitizenTicketSummary>();
  const [ticketDetail, setTicketDetail] = useState<CitizenTicketDetail>();
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
  const [grievanceSubmitting, setGrievanceSubmitting] = useState(false);

  const refreshHome = useCallback(async () => {
    if (!citizenAuth) return;
    setHomeLoading(true);
    try {
      const [pendingValidations, pendingCompletions, ongoing, resolved, notifications] = await Promise.all([
        loadPendingValidations(), loadPendingCompletionVerifications(), loadMyTickets("ongoing"), loadMyTickets("past"), loadNotifications(),
      ]);
      setHomeSummary({ pendingValidations: pendingValidations.length, pendingCompletions: pendingCompletions.length, ongoingReports: ongoing.length, resolvedReports: resolved.length, recentNotifications: notifications.notifications.slice(0, 3) });
      setNotificationUnread(notifications.unreadCount);
    } catch { /* Individual destination screens retain actionable error states. */ }
    finally { setHomeLoading(false); }
  }, [citizenAuth]);

  useEffect(() => {
    void (async () => {
      try {
        const auth = await loadCurrentAuth();
        if (auth.role === "ENGINEER") { setEngineerAuth(auth); setViewer("ENGINEER"); return; }
        if (auth.role === "CITIZEN") { setCitizenAuth(auth); setViewer("CITIZEN"); setScreen("home"); return; }
      } catch { /* Missing or expired sessions continue to Welcome. */ }
      setViewer("SIGNED_OUT"); setScreen("welcome");
    })();
  }, []);

  useEffect(() => {
    if (!citizenAuth) return;
    void loadCategories().then((result) => { setCategories(result); setCategoryError(undefined); }).catch((error: unknown) => setCategoryError(error instanceof Error ? error.message : "Could not load issue types"));
    void registerForPushNotifications().catch(() => { /* In-app notifications remain available if push permission is denied. */ });
    void (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return;
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await updateCitizenLocation(position.coords.latitude, position.coords.longitude);
    })().catch(() => { /* Reporting still requests precise location when needed. */ });
    void refreshHome();
    let active = true;
    const poll = () => { void loadNotifications(true).then((result) => { if (active) setNotificationUnread(result.unreadCount); }).catch(() => undefined); };
    const timer = setInterval(poll, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, [citizenAuth, refreshHome]);

  useEffect(() => {
    if (!citizenAuth || viewer !== "CITIZEN") return;
    const refreshPending = () => {
      void Promise.all([loadPendingValidations(), loadPendingCompletionVerifications(), loadNotifications(true)])
        .then(([pendingValidations, pendingCompletions, notifications]) => {
          setValidations(pendingValidations);
          setCompletionValidations(pendingCompletions);
          setHomeSummary((current) => ({
            ...current,
            pendingValidations: pendingValidations.length,
            pendingCompletions: pendingCompletions.length,
          }));
          setNotificationUnread(notifications.unreadCount);
        })
        .catch(() => undefined);
    };
    const unsubscribePush = subscribeToPushReceipt(refreshPending);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshPending();
    });
    return () => {
      unsubscribePush();
      appState.remove();
    };
  }, [citizenAuth, viewer]);

  const openTicketById = useCallback(async (ticketId: string) => {
    setScreen("detail"); setTicketDetailLoading(true); setTicketDetailError(undefined);
    try {
      const result = await loadTicket(ticketId);
      setTicketDetail(result.ticket);
      setTicketTimeline({ timeline: result.timeline, lifecycle: result.lifecycle, notes: result.notes, grievances: result.grievances, canRaiseGrievance: result.canRaiseGrievance });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open this ticket";
      setTicketDetailError(message); Alert.alert("Couldn’t open update", message);
    } finally { setTicketDetailLoading(false); }
  }, []);

  const openValidations = useCallback((ticketId?: string) => {
    setScreen("validations"); setValidationsLoading(true); setValidationsError(undefined);
    void loadPendingValidations().then((items) => {
      setValidations(items);
      const direct = ticketId ? items.find((item) => item.ticketId === ticketId) : undefined;
      if (direct) { setSelectedValidation(direct); setScreen("verification"); }
    }).catch((error: unknown) => setValidationsError(error instanceof Error ? error.message : "Could not load community requests")).finally(() => setValidationsLoading(false));
  }, []);

  const openCompletionValidations = useCallback((evidenceId?: string) => {
    setScreen("completion-validations"); setCompletionLoading(true); setCompletionError(undefined);
    void loadPendingCompletionVerifications().then((items) => {
      setCompletionValidations(items);
      const direct = evidenceId ? items.find((item) => item.evidenceId === evidenceId) : undefined;
      if (direct) { setSelectedCompletion(direct); setScreen("completion-verification"); }
    }).catch((error: unknown) => setCompletionError(error instanceof Error ? error.message : "Could not load completion checks")).finally(() => setCompletionLoading(false));
  }, []);

  useEffect(() => {
    if (!citizenAuth || viewer !== "CITIZEN") return;
    return subscribeToPushNavigation((data) => {
      if (data.type === "VALIDATION_REQUEST") { openValidations(typeof data.ticketId === "string" ? data.ticketId : undefined); return; }
      if (data.type === "COMPLETION_VERIFICATION_REQUEST") { openCompletionValidations(typeof data.evidenceId === "string" ? data.evidenceId : undefined); return; }
      if (typeof data.ticketId === "string") void openTicketById(data.ticketId);
    });
  }, [citizenAuth, openCompletionValidations, openTicketById, openValidations, viewer]);

  const resetReport = () => { setScreen("home"); setSelectedCategory(undefined); setImages([]); setLocation(undefined); setDraftTicketId(undefined); setImageValidationToken(undefined); setImageCheckError(undefined); setPhotoAttempt(0); setSubmitted(undefined); void refreshHome(); };
  const openTickets = (filter: "ongoing" | "past") => {
    setTicketFilter(filter); setScreen("tickets"); setTicketsLoading(true); setTicketsError(undefined);
    void loadMyTickets(filter).then(setTickets).catch((error: unknown) => setTicketsError(error instanceof Error ? error.message : "Could not load reports")).finally(() => setTicketsLoading(false));
  };
  const openTicket = (ticket: CitizenTicketSummary) => { setSubmitted(ticket); void openTicketById(ticket.id); };
  const openNotification = (notification: MobileNotification) => {
    if (notification.type === "VALIDATION_REQUEST") { openValidations(typeof notification.payload.ticketId === "string" ? notification.payload.ticketId : undefined); return; }
    if (notification.type === "COMPLETION_VERIFICATION_REQUEST") { openCompletionValidations(typeof notification.payload.evidenceId === "string" ? notification.payload.evidenceId : undefined); return; }
    const ticketId = typeof notification.payload.ticketId === "string" ? notification.payload.ticketId : undefined;
    if (ticketId) { void openTicketById(ticketId); return; }
    openTickets(notification.type === "TICKET_RESOLVED" ? "past" : "ongoing");
  };
  const submitValidationVote = async (vote: ValidationVote) => {
    if (!selectedValidation) return;
    setValidationSubmitting(true);
    try {
      const result = await validateTicket(selectedValidation.ticketId, vote);
      Alert.alert("Thanks", "Your response has been recorded.");
      setValidations((current) => current.filter((item) => item.ticketId !== selectedValidation.ticketId));
      setSelectedValidation(undefined); setScreen("validations");
      setHomeSummary((current) => ({ ...current, pendingValidations: Math.max(0, current.pendingValidations - 1) }));
      if (result.confirmationCount >= result.quorum) void refreshHome();
    } catch (error) { Alert.alert("Couldn’t record response", error instanceof Error ? error.message : "Please try again."); }
    finally { setValidationSubmitting(false); }
  };
  const submitCompletionVote = async (decision: CompletionVerificationDecision) => {
    if (!selectedCompletion) return;
    setCompletionSubmitting(true);
    try {
      await verifyCompletion(selectedCompletion.evidenceId, decision);
      Alert.alert(decision === "VERIFIED" ? "Resolution confirmed" : "Rework requested", "Thanks. Your response has been recorded.");
      setCompletionValidations((current) => current.filter((item) => item.evidenceId !== selectedCompletion.evidenceId));
      setSelectedCompletion(undefined); setScreen("completion-validations");
      setHomeSummary((current) => ({ ...current, pendingCompletions: Math.max(0, current.pendingCompletions - 1) }));
    } catch (error) { Alert.alert("Couldn’t record response", error instanceof Error ? error.message : "Please try again."); }
    finally { setCompletionSubmitting(false); }
  };
  const completeSubmission = async () => {
    if (!selectedCategory || !images[0] || !location || !imageValidationToken) return;
    setSubmitting(true);
    const report: DraftReport = { categoryId: selectedCategory.id, title: `${selectedCategory.name} near ${location.address.split(",")[0]}`, address: location.address, latitude: location.latitude, longitude: location.longitude };
    try {
      const result = await submitReport(report, images[0], images.slice(1), imageValidationToken, draftTicketId);
      if (result.needsRetake) { setDraftTicketId(result.ticketId); setFeedback(result); setScreen("feedback"); }
      else { setSubmitted(result.ticket); setDraftTicketId(undefined); setScreen("confirmation"); }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please try again.";
      if (message.includes("doesn’t appear to match") || message.includes("photo validation")) {
        setImageValidationToken(undefined); setFeedback({ message, attemptsRemaining: Math.max(0, 3 - photoAttempt) }); setScreen("feedback");
      } else Alert.alert("Couldn’t submit report", message);
    }
    finally { setSubmitting(false); }
  };
  const continueAfterPhotoCheck = async () => {
    if (!selectedCategory || !images[0]) return;
    const nextAttempt = photoAttempt + 1;
    setImageChecking(true); setImageCheckError(undefined); setPhotoAttempt(nextAttempt);
    try {
      const result = await validateReportImage(selectedCategory.id, images[0], nextAttempt);
      if (nextScreenAfterPhotoCheck(result) === "location-detect" && result.validationToken) {
        setImageValidationToken(result.validationToken); setScreen("location-detect");
      } else {
        setImageValidationToken(undefined);
        setFeedback({ message: photoRejectionMessage(result.reason), attemptsRemaining: result.attemptsRemaining });
        setScreen("feedback");
      }
    } catch (error) {
      setImageValidationToken(undefined);
      setImageCheckError(error instanceof Error ? error.message : "We could not check this photo right now. Please try again.");
    } finally { setImageChecking(false); }
  };
  const refreshTicket = async () => { if (ticketDetail) await openTicketById(ticketDetail.id); };
  const submitGrievance = async (reason: CitizenGrievanceReason, note?: string, evidence?: LocalImage) => {
    if (!ticketDetail) return;
    setGrievanceSubmitting(true);
    try {
      await raiseCitizenGrievance(ticketDetail.id, reason, note, evidence);
      await openTicketById(ticketDetail.id);
      Alert.alert("Grievance submitted", "City Connect grievance escalation is now tracking your request.");
    } catch (error) { Alert.alert("Couldn’t submit grievance", error instanceof Error ? error.message : "Please try again."); }
    finally { setGrievanceSubmitting(false); }
  };
  const signOut = () => { void logoutSession(); setCitizenAuth(undefined); setEngineerAuth(undefined); setViewer("SIGNED_OUT"); setScreen("welcome"); setHomeSummary(emptyHomeSummary); };

  if (viewer === "LOADING") return <DesignSystemProvider theme="citizen"><StatusBar style="light" /><SplashScreen /></DesignSystemProvider>;
  if (viewer === "ENGINEER" && engineerAuth) return <DesignSystemProvider theme="internal"><StatusBar style="dark" /><EngineerProjectsApp auth={engineerAuth} onLogout={signOut} /></DesignSystemProvider>;
  if (viewer === "SIGNED_OUT") {
    const entry = screen === "citizen-login" ? <CitizenLoginScreen onAuthenticated={(auth) => { setCitizenAuth(auth); setViewer("CITIZEN"); setScreen("home"); }} onBack={() => setScreen("welcome")} /> : screen === "engineer-login" ? <EngineerLoginScreen onCancel={() => setScreen("welcome")} onLogin={(auth) => { setEngineerAuth(auth); setViewer("ENGINEER"); }} /> : <WelcomeScreen onCitizen={() => setScreen("citizen-login")} onStaff={() => setScreen("engineer-login")} />;
    return <DesignSystemProvider theme={screen === "engineer-login" ? "internal" : "citizen"}><StatusBar style="dark" />{entry}</DesignSystemProvider>;
  }
  if (!citizenAuth) return <DesignSystemProvider theme="citizen"><StatusBar style="dark" /><SplashScreen /></DesignSystemProvider>;

  let content;
  if (screen === "category") content = <CategoryScreen categories={categories} loading={!categoryError && categories.length === 0} error={categoryError} selectedId={selectedCategory?.id} onBack={() => setScreen("home")} onSelect={(category) => { setSelectedCategory(category); setImageValidationToken(undefined); setImageCheckError(undefined); setScreen("evidence"); }} />;
  else if (screen === "evidence") content = <EvidenceScreen images={images} checking={imageChecking} checkError={imageCheckError} onChange={(next) => { setImages(next); setImageValidationToken(undefined); setImageCheckError(undefined); }} onBack={() => setScreen("category")} onNext={() => void continueAfterPhotoCheck()} />;
  else if (screen === "location-detect") content = <LocationDetectScreen onBack={() => setScreen("evidence")} onDetected={(next) => { setLocation(next); setScreen("location-confirm"); }} />;
  else if (screen === "location-confirm" && location) content = <LocationConfirmScreen value={location} onChange={setLocation} onBack={() => setScreen("evidence")} onRetry={() => setScreen("location-detect")} onNext={() => setScreen("review")} />;
  else if (screen === "review" && selectedCategory && images[0] && location) content = <ReviewReportScreen category={selectedCategory} image={images[0]} location={location} submitting={submitting} onBack={() => setScreen("location-confirm")} onSubmit={() => void completeSubmission()} />;
  else if (screen === "feedback") content = <RetakeScreen attemptsRemaining={feedback.attemptsRemaining} reason={feedback.message || "Please upload a real photo of the civic issue."} onSelected={(image) => { setImages((current) => [image, ...current.slice(1)]); setImageValidationToken(undefined); setImageCheckError(undefined); setScreen("evidence"); }} />;
  else if (screen === "confirmation" && submitted && images[0] && location) content = <ConfirmationScreen ticket={submitted} image={images[0]} location={location} onView={() => void openTicketById(submitted.id)} onDone={resetReport} />;
  else if (screen === "detail" && ticketDetail) content = <TicketDetailScreen ticket={ticketDetail} timeline={ticketTimeline} loading={ticketDetailLoading} error={ticketDetailError} onRefresh={() => void refreshTicket()} onDone={() => openTickets("ongoing")} onRaiseGrievance={() => setScreen("grievance")} />;
  else if (screen === "detail") content = <Shell><View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /><Text style={styles.loadingText}>{ticketDetailError ?? "Loading ticket details…"}</Text></View></Shell>;
  else if (screen === "grievance" && ticketDetail) content = <GrievanceScreen submitting={grievanceSubmitting} onBack={() => setScreen("detail")} onSubmit={(reason, note, evidence) => void submitGrievance(reason, note, evidence)} />;
  else if (screen === "tickets") content = <TicketsScreen filter={ticketFilter} tickets={tickets} loading={ticketsLoading} error={ticketsError} onBack={() => setScreen("home")} onFilterChange={openTickets} onOpen={openTicket} />;
  else if (screen === "validations") content = <VerificationListScreen validations={validations} loading={validationsLoading} error={validationsError} onBack={() => setScreen("home")} onOpen={(validation) => { setSelectedValidation(validation); setScreen("verification"); }} />;
  else if (screen === "verification" && selectedValidation) content = <VerificationRequestScreen validation={selectedValidation} submitting={validationSubmitting} onBack={() => setScreen("validations")} onSubmit={(vote) => void submitValidationVote(vote)} />;
  else if (screen === "completion-validations") content = <CompletionVerificationListScreen completions={completionValidations} loading={completionLoading} error={completionError} onBack={() => setScreen("home")} onOpen={(completion) => { setSelectedCompletion(completion); setScreen("completion-verification"); }} />;
  else if (screen === "completion-verification" && selectedCompletion) content = <CompletionVerificationScreen completion={selectedCompletion} submitting={completionSubmitting} onBack={() => setScreen("completion-validations")} onSubmit={(decision) => void submitCompletionVote(decision)} />;
  else if (screen === "notifications") content = <NotificationsScreen role="CITIZEN" onBack={() => setScreen("home")} onOpen={openNotification} onViewed={() => setNotificationUnread(0)} />;
  else if (screen === "profile") content = <CitizenProfileScreen auth={citizenAuth} onSignOut={signOut} />;
  else content = <HomeScreen auth={citizenAuth} unread={notificationUnread} summary={homeSummary} loading={homeLoading} onReport={() => setScreen("category")} onTickets={openTickets} onValidations={() => openValidations()} onCompletionValidations={() => openCompletionValidations()} onNotifications={() => setScreen("notifications")} onProfile={() => setScreen("profile")} onOpenNotification={openNotification} />;

  const tabs: MobileTab[] = [
    { id: "home", label: "Home", icon: "home-outline", activeIcon: "home" },
    { id: "report", label: "Report", icon: "add-circle-outline", activeIcon: "add-circle" },
    { id: "tickets", label: "My Reports", icon: "document-text-outline", activeIcon: "document-text" },
    { id: "notifications", label: "Updates", icon: "notifications-outline", activeIcon: "notifications", badge: notificationUnread },
    { id: "profile", label: "Profile", icon: "person-outline", activeIcon: "person" },
  ];
  const activeTab = screen === "home" ? "home" : ["category", "evidence", "location-detect", "location-confirm", "review", "feedback", "confirmation"].includes(screen) ? "report" : ["tickets", "detail", "grievance"].includes(screen) ? "tickets" : ["validations", "verification", "completion-validations", "completion-verification", "notifications"].includes(screen) ? "notifications" : "profile";
  const selectTab = (id: string) => {
    if (id === "home") { setScreen("home"); void refreshHome(); }
    else if (id === "profile") setScreen("profile");
    else if (id === "report") { setScreen("category"); }
    else if (id === "tickets") openTickets("ongoing");
    else if (id === "notifications") setScreen("notifications");
  };
  return <DesignSystemProvider theme="citizen"><StatusBar style="dark" /><View style={styles.app}><View style={styles.stage}>{content}</View><View style={styles.tabInset}><MobileTabBar active={activeTab} items={tabs} onSelect={selectTab} /></View></View></DesignSystemProvider>;
}

const styles = StyleSheet.create({ app: { backgroundColor: colors.canvas, flex: 1 }, stage: { flex: 1 }, tabInset: { backgroundColor: colors.surface }, loading: { alignItems: "center", flex: 1, gap: 15, justifyContent: "center", padding: 30 }, loadingText: { color: colors.ink, fontSize: 15, textAlign: "center" } });
