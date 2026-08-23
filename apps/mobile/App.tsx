import { useCallback, useEffect, useState } from "react";
import type { CategorySummary, CitizenTicketSummary, PendingValidation, ValidationVote } from "@civicos/shared";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { loadCategories, loadCurrentAuth, loadMyTickets, loadPendingValidations, submitReport, validateTicket, type DraftReport, type LocalImage } from "./src/api";
import { EngineerDependenciesApp } from "./src/engineer-dependencies";
import { CategoryScreen, ConfirmationScreen, EvidenceScreen, HomeScreen, LocationScreen, RetakeScreen, Shell, TicketDetailScreen, TicketsScreen, VerificationListScreen, VerificationRequestScreen, type ConfirmedLocation } from "./src/screens";
import { colors } from "./src/theme";

type Screen = "home" | "category" | "evidence" | "location" | "feedback" | "confirmation" | "detail" | "tickets" | "validations" | "verification";

export default function App() {
  const [viewerRole, setViewerRole] = useState<"ENGINEER" | "OTHER" | "LOADING">("LOADING");
  const [engineerUserId, setEngineerUserId] = useState<string>();
  const [screen, setScreen] = useState<Screen>("home");
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [categoryError, setCategoryError] = useState<string>();
  const [selectedCategory, setSelectedCategory] = useState<CategorySummary>();
  const [images, setImages] = useState<LocalImage[]>([]);
  const [location, setLocation] = useState<ConfirmedLocation>();
  const [draftTicketId, setDraftTicketId] = useState<string>();
  const [feedback, setFeedback] = useState({ message: "", attemptsRemaining: 0 });
  const [submitted, setSubmitted] = useState<CitizenTicketSummary>();
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

  useEffect(() => {
    void (async () => {
      try {
        const auth = await loadCurrentAuth();
        if (auth.role === "ENGINEER") { setEngineerUserId(auth.userId); setViewerRole("ENGINEER"); return; }
      } catch { /* Public/citizen startup continues without an internal role. */ }
      setViewerRole("OTHER");
      try { setCategories(await loadCategories()); }
      catch (error) { setCategoryError(error instanceof Error ? error.message : "Could not load issue types"); }
    })();
  }, []);

  if (viewerRole === "ENGINEER" && engineerUserId) return <><StatusBar style="dark" /><EngineerDependenciesApp currentUserId={engineerUserId} /></>;
  if (viewerRole === "LOADING") return <><StatusBar style="dark" /><Shell><View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.loadingText}>Loading CivicOS…</Text></View></Shell></>;

  const updateLocation = useCallback((next: ConfirmedLocation) => setLocation(next), []);
  const reset = () => {
    setScreen("home"); setSelectedCategory(undefined); setImages([]); setLocation(undefined); setDraftTicketId(undefined); setSubmitted(undefined);
  };
  const openTickets = (filter: "ongoing" | "past") => {
    setTicketFilter(filter); setScreen("tickets"); setTicketsLoading(true); setTicketsError(undefined);
    void loadMyTickets(filter).then(setTickets).catch((error: unknown) => setTicketsError(error instanceof Error ? error.message : "Could not load tickets")).finally(() => setTicketsLoading(false));
  };
  const openValidations = () => {
    setScreen("validations"); setValidationsLoading(true); setValidationsError(undefined);
    void loadPendingValidations().then(setValidations).catch((error: unknown) => setValidationsError(error instanceof Error ? error.message : "Could not load nearby requests")).finally(() => setValidationsLoading(false));
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
  else if (screen === "confirmation" && submitted) content = <ConfirmationScreen ticket={submitted} onView={() => setScreen("detail")} onDone={reset} />;
  else if (screen === "detail" && submitted) content = <TicketDetailScreen ticket={submitted} onDone={reset} />;
  else if (screen === "tickets") content = <TicketsScreen filter={ticketFilter} tickets={tickets} loading={ticketsLoading} error={ticketsError} onBack={() => setScreen("home")} />;
  else if (screen === "validations") content = <VerificationListScreen validations={validations} loading={validationsLoading} error={validationsError} onBack={() => setScreen("home")} onOpen={(validation) => { setSelectedValidation(validation); setScreen("verification"); }} />;
  else if (screen === "verification" && selectedValidation) content = <VerificationRequestScreen validation={selectedValidation} submitting={validationSubmitting} onBack={() => setScreen("validations")} onSubmit={(vote) => void submitValidationVote(vote)} />;
  else content = <HomeScreen onReport={() => setScreen("category")} onTickets={openTickets} onValidations={openValidations} />;
  return <><StatusBar style="dark" />{content}</>;
}

const styles = StyleSheet.create({ loading: { alignItems: "center", flex: 1, gap: 16, justifyContent: "center" }, loadingText: { color: colors.ink, fontSize: 17, fontWeight: "700" } });
