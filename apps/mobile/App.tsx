import { useCallback, useEffect, useState } from "react";
import type { CategorySummary, CitizenTicketSummary } from "@civicos/shared";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { loadCategories, loadMyTickets, submitReport, type DraftReport, type LocalImage } from "./src/api";
import { CategoryScreen, ConfirmationScreen, EvidenceScreen, HomeScreen, LocationScreen, RetakeScreen, Shell, TicketDetailScreen, TicketsScreen, type ConfirmedLocation } from "./src/screens";
import { colors } from "./src/theme";

type Screen = "home" | "category" | "evidence" | "location" | "feedback" | "confirmation" | "detail" | "tickets";

export default function App() {
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

  useEffect(() => {
    void loadCategories().then(setCategories).catch((error: unknown) => setCategoryError(error instanceof Error ? error.message : "Could not load issue types"));
  }, []);

  const updateLocation = useCallback((next: ConfirmedLocation) => setLocation(next), []);
  const reset = () => {
    setScreen("home"); setSelectedCategory(undefined); setImages([]); setLocation(undefined); setDraftTicketId(undefined); setSubmitted(undefined);
  };
  const openTickets = (filter: "ongoing" | "past") => {
    setTicketFilter(filter); setScreen("tickets"); setTicketsLoading(true); setTicketsError(undefined);
    void loadMyTickets(filter).then(setTickets).catch((error: unknown) => setTicketsError(error instanceof Error ? error.message : "Could not load tickets")).finally(() => setTicketsLoading(false));
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
  else content = <HomeScreen onReport={() => setScreen("category")} onTickets={openTickets} />;
  return <><StatusBar style="dark" />{content}</>;
}

const styles = StyleSheet.create({ loading: { alignItems: "center", flex: 1, gap: 16, justifyContent: "center" }, loadingText: { color: colors.ink, fontSize: 17, fontWeight: "700" } });
