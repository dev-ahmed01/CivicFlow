import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CategorySummary, CitizenTicketSummary, CompletionVerificationDecision, PendingCompletionVerification, PendingValidation, ValidationVote } from "@civicos/shared";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import MapView, { Marker } from "react-native-maps";
import { ActivityIndicator, FlatList, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { LocalImage } from "./api";
import { PrimaryButton, ScreenHeader, SecondaryButton } from "./components";
import { colors } from "./theme";

export function Shell({ children }: { children: ReactNode }) { return <SafeAreaView style={styles.safe}><View style={styles.shell}>{children}</View></SafeAreaView>; }

export function HomeScreen({ notificationUnread, onNotifications, onReport, onTickets, onValidations, onCompletionValidations, onEngineerLogin }: { notificationUnread: number; onNotifications: () => void; onReport: () => void; onTickets: (filter: "ongoing" | "past") => void; onValidations: () => void; onCompletionValidations: () => void; onEngineerLogin: () => void }) {
  return <Shell><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.brand}><Text style={styles.brandMark}>C</Text><Text style={styles.brandName}>CivicOS</Text></View>
    <View style={styles.hero}><Text style={styles.kicker}>Your city, heard</Text><Text style={styles.heroTitle}>Spot a civic issue?</Text><Text style={styles.body}>Share a photo and location. We’ll keep you updated in plain language.</Text><PrimaryButton onPress={onReport}>Report an Issue</PrimaryButton></View>
    <Pressable accessibilityRole="button" style={styles.validationBanner} onPress={onValidations}><View><Text style={styles.kicker}>Community check</Text><Text style={styles.cardTitle}>Nearby verification requests</Text><Text style={styles.cardHint}>Help confirm an issue close to you</Text></View><Text style={styles.bannerArrow}>›</Text></Pressable>
    <Pressable accessibilityRole="button" style={styles.validationBanner} onPress={onCompletionValidations}><View><Text style={styles.kicker}>Completion check</Text><Text style={styles.cardTitle}>Verify completed work</Text><Text style={styles.cardHint}>Review evidence for issues you validated</Text></View><Text style={styles.bannerArrow}>›</Text></Pressable>
    <Text style={styles.sectionTitle}>My tickets</Text><View style={styles.row}>
      <Pressable style={styles.statCard} onPress={() => onTickets("ongoing")}><Text style={styles.statIcon}>◷</Text><Text style={styles.cardTitle}>Ongoing</Text><Text style={styles.cardHint}>Track current reports</Text></Pressable>
      <Pressable style={styles.statCard} onPress={() => onTickets("past")}><Text style={styles.statIcon}>✓</Text><Text style={styles.cardTitle}>Past</Text><Text style={styles.cardHint}>See closed reports</Text></Pressable>
    </View><SecondaryButton onPress={onEngineerLogin}>Executive Engineer sign in</SecondaryButton>
    <View accessibilityRole="tablist" style={styles.mobileTabs}><View accessibilityRole="tab" accessibilityState={{ selected: true }} style={[styles.mobileTab, styles.mobileTabActive]}><Text style={styles.mobileTabTextActive}>Home</Text></View><Pressable accessibilityRole="tab" accessibilityState={{ selected: false }} onPress={onNotifications} style={styles.mobileTab}><Text style={styles.mobileTabText}>Notifications{notificationUnread > 0 ? ` (${notificationUnread})` : ""}</Text></Pressable></View>
  </ScrollView></Shell>;
}

export function CategoryScreen({ categories, selectedId, onSelect, onBack, loading, error }: { categories: CategorySummary[]; selectedId?: string; onSelect: (category: CategorySummary) => void; onBack: () => void; loading: boolean; error?: string }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => categories.filter((category) => category.name.toLowerCase().includes(query.toLowerCase())), [categories, query]);
  return <Shell><View style={styles.content}><ScreenHeader eyebrow="Step 1 of 4" title="What needs attention?" onBack={onBack} />
    <TextInput accessibilityLabel="Search issue categories" placeholder="Search issue types" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} style={styles.input} />
    {loading ? <ActivityIndicator color={colors.primary} /> : null}{error ? <Text style={styles.error}>{error}</Text> : null}
    <FlatList data={filtered} numColumns={2} keyExtractor={(item) => item.id} columnWrapperStyle={styles.gridRow} contentContainerStyle={styles.grid} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityState={{ selected: item.id === selectedId }} onPress={() => onSelect(item)} style={[styles.categoryCard, item.id === selectedId && styles.categorySelected]}><View style={styles.categoryIcon}><Text style={styles.categoryIconText}>{item.name.slice(0, 1)}</Text></View><Text style={styles.categoryName}>{item.name}</Text></Pressable>} />
  </View></Shell>;
}

function normalizeAsset(asset: ImagePicker.ImagePickerAsset): LocalImage {
  const extension = asset.uri.split(".").pop()?.toLowerCase();
  const contentType = asset.mimeType === "image/png" || extension === "png" ? "image/png" : asset.mimeType === "image/webp" || extension === "webp" ? "image/webp" : asset.mimeType === "image/heic" || extension === "heic" ? "image/heic" : "image/jpeg";
  return { uri: asset.uri, fileName: asset.fileName ?? `civic-photo-${Date.now()}.${extension ?? "jpg"}`, contentType };
}

export function EvidenceScreen({ images, onChange, onNext, onBack }: { images: LocalImage[]; onChange: (images: LocalImage[]) => void; onNext: () => void; onBack: () => void }) {
  const pick = async (source: "camera" | "gallery") => {
    const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = source === "camera" ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85, exif: true }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85, allowsMultipleSelection: true, selectionLimit: Math.max(1, 4 - images.length), exif: true });
    if (!result.canceled) onChange([...images, ...result.assets.map(normalizeAsset)].slice(0, 4));
  };
  return <Shell><ScrollView contentContainerStyle={styles.content}><ScreenHeader eyebrow="Step 2 of 4" title="Show us the issue" onBack={onBack} /><Text style={styles.body}>Add one clear main photo. You can include up to three more angles.</Text>
    <View style={[styles.photoTile, styles.primaryPhoto]}>{images[0] ? <Image source={{ uri: images[0].uri }} style={styles.photo} /> : <><Text style={styles.photoPlus}>＋</Text><Text style={styles.cardTitle}>Main photo required</Text></>}</View>
    <View style={styles.row}><SecondaryButton onPress={() => void pick("camera")}>Use Camera</SecondaryButton><SecondaryButton onPress={() => void pick("gallery")}>Choose Photos</SecondaryButton></View>
    {images.length > 1 ? <View style={styles.supportingRow}>{images.slice(1).map((image, index) => <View key={`${image.uri}-${index}`} style={styles.supportingTile}><Image source={{ uri: image.uri }} style={styles.photo} /></View>)}</View> : null}<PrimaryButton disabled={!images[0]} onPress={onNext}>Continue</PrimaryButton>
  </ScrollView></Shell>;
}

export type ConfirmedLocation = { latitude: number; longitude: number; address: string; confidenceLow: boolean };
export function LocationScreen({ value, onChange, onNext, onBack }: { value?: ConfirmedLocation; onChange: (location: ConfirmedLocation) => void; onNext: () => void; onBack: () => void }) {
  const [loading, setLoading] = useState(!value); const [error, setError] = useState<string>(); const [adjusting, setAdjusting] = useState(false);
  useEffect(() => { if (value) return; void (async () => { const permission = await Location.requestForegroundPermissionsAsync(); if (!permission.granted) { setError("Location access is needed to place the report."); setLoading(false); return; } const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }); const { latitude, longitude, accuracy } = position.coords; const places = await Location.reverseGeocodeAsync({ latitude, longitude }); const place = places[0]; const address = place ? [place.name, place.street, place.district, place.city].filter(Boolean).join(", ") : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`; onChange({ latitude, longitude, address, confidenceLow: (accuracy ?? 100) > 40 }); setLoading(false); })().catch(() => { setError("We couldn’t detect your location. Please try again."); setLoading(false); }); }, [onChange, value]);
  const movePin = (event: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) => { if (value) onChange({ ...value, ...event.nativeEvent.coordinate, confidenceLow: false }); };
  return <Shell><ScrollView contentContainerStyle={styles.content}><ScreenHeader eyebrow="Step 3 of 4" title="Confirm the location" onBack={onBack} />{loading ? <View style={styles.loadingBox}><ActivityIndicator color={colors.primary} /><Text style={styles.body}>Finding your location…</Text></View> : null}{error ? <Text style={styles.error}>{error}</Text> : null}{value ? <><MapView style={styles.map} onPress={adjusting ? movePin : undefined} region={{ latitude: value.latitude, longitude: value.longitude, latitudeDelta: 0.008, longitudeDelta: 0.008 }}><Marker coordinate={value} draggable={adjusting} onDragEnd={movePin} /></MapView><TextInput accessibilityLabel="Issue address" multiline value={value.address} onChangeText={(address) => onChange({ ...value, address })} style={[styles.input, styles.addressInput]} />{value.confidenceLow ? <Text style={styles.notice}>Please check the pin — the detected location may be approximate.</Text> : null}<SecondaryButton onPress={() => setAdjusting((current) => !current)}>{adjusting ? "Finish Adjusting" : "Adjust Pin"}</SecondaryButton><PrimaryButton disabled={!value.address.trim()} onPress={onNext}>Review & Submit</PrimaryButton></> : null}</ScrollView></Shell>;
}

export function RetakeScreen({ message, attemptsRemaining, onRetake }: { message: string; attemptsRemaining: number; onRetake: () => void }) { return <Shell><View style={[styles.content, styles.centered]}><View style={styles.feedbackIcon}><Text style={styles.feedbackIconText}>↻</Text></View><ScreenHeader title="Let’s try a clearer photo" /><Text style={[styles.body, styles.centerText]}>{message}</Text><Text style={styles.hint}>{attemptsRemaining} photo {attemptsRemaining === 1 ? "try" : "tries"} remaining before we send it for a person to review.</Text><PrimaryButton onPress={onRetake}>Retake Photo</PrimaryButton></View></Shell>; }
export function ConfirmationScreen({ ticket, onView, onDone }: { ticket: CitizenTicketSummary; onView: () => void; onDone: () => void }) { return <Shell><View style={[styles.content, styles.centered]}><View style={styles.success}><Text style={styles.successText}>✓</Text></View><Text style={styles.kicker}>Report submitted</Text><Text style={[styles.heroTitle, styles.centerText]}>{ticket.title}</Text><View style={styles.idCard}><Text style={styles.hint}>Ticket ID</Text><Text selectable style={styles.ticketId}>{ticket.id}</Text></View><PrimaryButton onPress={onView}>View Ticket</PrimaryButton><SecondaryButton onPress={onDone}>Done</SecondaryButton></View></Shell>; }
export function TicketDetailScreen({ ticket, onDone }: { ticket: CitizenTicketSummary; onDone: () => void }) { return <Shell><ScrollView contentContainerStyle={styles.content}><ScreenHeader title={ticket.title} onBack={onDone} /><Text style={styles.status}>{ticket.statusLabel}</Text><View style={styles.ticketCard}><Text style={styles.kicker}>{ticket.category.name}</Text><Text style={styles.body}>{ticket.address}</Text><Text style={styles.hint}>Ticket ID</Text><Text selectable style={styles.ticketId}>{ticket.id}</Text><Text style={styles.cardHint}>{ticket.observationCount} community {ticket.observationCount === 1 ? "report" : "reports"}</Text></View><PrimaryButton onPress={onDone}>Done</PrimaryButton></ScrollView></Shell>; }
export function TicketsScreen({ filter, tickets, loading, error, onBack }: { filter: "ongoing" | "past"; tickets: CitizenTicketSummary[]; loading: boolean; error?: string; onBack: () => void }) { return <Shell><View style={styles.content}><ScreenHeader title={filter === "ongoing" ? "Ongoing tickets" : "Past tickets"} onBack={onBack} />{loading ? <ActivityIndicator color={colors.primary} /> : null}{error ? <Text style={styles.error}>{error}</Text> : null}<FlatList data={tickets} keyExtractor={(item) => item.id} ListEmptyComponent={!loading ? <Text style={styles.body}>No {filter} tickets yet.</Text> : null} renderItem={({ item }) => <View style={styles.ticketCard}><View style={styles.ticketTop}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.status}>{item.statusLabel}</Text></View><Text style={styles.cardHint}>{item.category.name} · {item.address}</Text><Text style={styles.hint}>{item.observationCount} community {item.observationCount === 1 ? "report" : "reports"}</Text></View>} /></View></Shell>; }

export function VerificationListScreen({ validations, loading, error, onBack, onOpen }: { validations: PendingValidation[]; loading: boolean; error?: string; onBack: () => void; onOpen: (validation: PendingValidation) => void }) {
  return <Shell><View style={styles.content}><ScreenHeader eyebrow="Community verification" title="Issues near you" onBack={onBack} />{loading ? <ActivityIndicator color={colors.primary} /> : null}{error ? <Text style={styles.error}>{error}</Text> : null}<FlatList data={validations} keyExtractor={(item) => item.ticketId} ListEmptyComponent={!loading ? <Text style={styles.body}>No nearby requests need your help right now.</Text> : null} renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => onOpen(item)} style={styles.ticketCard}><Text style={styles.kicker}>{item.category.name}</Text><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.cardHint}>{Math.round(item.distanceMeters)} m away</Text></Pressable>} /></View></Shell>;
}

const validationActions: Array<{ vote: ValidationVote; label: string; style: "confirm" | "neutral" | "reject" }> = [
  { vote: "CONFIRM", label: "Confirm this exists", style: "confirm" },
  { vote: "NOT_SURE", label: "Not sure", style: "neutral" },
  { vote: "REJECT", label: "Doesn’t look right", style: "reject" },
];

export function VerificationRequestScreen({ validation, submitting, onBack, onSubmit }: { validation: PendingValidation; submitting: boolean; onBack: () => void; onSubmit: (vote: ValidationVote) => void }) {
  return <Shell><ScrollView contentContainerStyle={styles.content}><ScreenHeader eyebrow="Nearby verification request" title="Can you confirm this?" onBack={onBack} /><View style={styles.validationPhoto}><Image source={{ uri: validation.imageUrl }} resizeMode="cover" style={styles.photo} /></View><View style={styles.ticketCard}><Text style={styles.kicker}>{validation.category.name}</Text><Text style={styles.cardTitle}>{validation.title}</Text><Text style={styles.cardHint}>{Math.round(validation.distanceMeters)} m from your last known location</Text></View><Text style={styles.body}>Choose the response that best matches what you can verify. Other people’s responses stay private until after you answer.</Text><View style={styles.validationActions}>{validationActions.map((action) => <Pressable accessibilityRole="button" disabled={submitting} key={action.vote} onPress={() => onSubmit(action.vote)} style={[styles.voteButton, action.style === "confirm" ? styles.voteConfirm : action.style === "reject" ? styles.voteReject : styles.voteNeutral, submitting && styles.disabled]}><Text style={[styles.voteLabel, action.style === "confirm" ? styles.voteConfirmLabel : action.style === "reject" ? styles.voteRejectLabel : undefined]}>{action.label}</Text></Pressable>)}</View></ScrollView></Shell>;
}

export function CompletionVerificationListScreen({ completions, loading, error, onBack, onOpen }: { completions: PendingCompletionVerification[]; loading: boolean; error?: string; onBack: () => void; onOpen: (completion: PendingCompletionVerification) => void }) {
  return <Shell><View style={styles.content}><ScreenHeader eyebrow="Completion verification" title="Work awaiting your check" onBack={onBack} />{loading ? <ActivityIndicator color={colors.primary} /> : null}{error ? <Text style={styles.error}>{error}</Text> : null}<FlatList data={completions} keyExtractor={(item) => item.evidenceId} ListEmptyComponent={!loading ? <Text style={styles.body}>No completed work needs your review.</Text> : null} renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => onOpen(item)} style={styles.ticketCard}><Text style={styles.kicker}>Ticket {item.ticketId.slice(0, 8)}</Text><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.cardHint}>Submitted {new Date(item.submittedAt).toLocaleDateString()}</Text></Pressable>} /></View></Shell>;
}

export function CompletionVerificationScreen({ completion, submitting, onBack, onSubmit }: { completion: PendingCompletionVerification; submitting: boolean; onBack: () => void; onSubmit: (decision: CompletionVerificationDecision) => void }) {
  return <Shell><ScrollView contentContainerStyle={styles.content}><ScreenHeader eyebrow="Completion verification" title="Does the completed work look right?" onBack={onBack} /><View style={styles.validationPhoto}><Image source={{ uri: completion.photoUrl }} resizeMode="cover" style={styles.photo} /></View><View style={styles.ticketCard}><Text style={styles.cardTitle}>{completion.title}</Text><Text style={styles.body}>{completion.notes}</Text></View><PrimaryButton disabled={submitting} onPress={() => onSubmit("VERIFIED")}>Verify completion</PrimaryButton><Pressable accessibilityRole="button" disabled={submitting} onPress={() => onSubmit("REWORK_REQUESTED")} style={[styles.voteButton, styles.voteReject, submitting && styles.disabled]}><Text style={[styles.voteLabel, styles.voteRejectLabel]}>Request rework</Text></Pressable></ScrollView></Shell>;
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.canvas, flex: 1 },
  shell: { flex: 1 },
  content: { flexGrow: 1, gap: 18, padding: 22, paddingTop: 30 },
  brand: { alignItems: "center", flexDirection: "row", gap: 10 },
  brandMark: { backgroundColor: colors.primary, borderRadius: 12, color: "white", fontSize: 22, fontWeight: "900", overflow: "hidden", paddingHorizontal: 12, paddingVertical: 7 },
  brandName: { color: colors.ink, fontSize: 21, fontWeight: "900" },
  hero: { backgroundColor: colors.surface, borderRadius: 26, gap: 16, marginTop: 28, padding: 24 },
  kicker: { color: colors.primary, fontSize: 14, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  heroTitle: { color: colors.ink, fontSize: 36, fontWeight: "900", letterSpacing: -1 },
  body: { color: colors.muted, fontSize: 17, lineHeight: 25 },
  sectionTitle: { color: colors.ink, fontSize: 21, fontWeight: "900", marginTop: 12 },
  row: { flexDirection: "row", gap: 12 },
  statCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, flex: 1, gap: 6, padding: 18 },
  statIcon: { color: colors.primary, fontSize: 28, fontWeight: "800" },
  cardTitle: { color: colors.ink, flexShrink: 1, fontSize: 17, fontWeight: "800" },
  cardHint: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 15, borderWidth: 1, color: colors.ink, fontSize: 16, paddingHorizontal: 16, paddingVertical: 14 },
  grid: { gap: 12, paddingBottom: 120 },
  gridRow: { gap: 12 },
  categoryCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flex: 1, gap: 12, marginBottom: 12, minHeight: 130, padding: 17 },
  categorySelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderWidth: 2 },
  categoryIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 22, height: 44, justifyContent: "center", width: 44 },
  categoryIconText: { color: colors.primary, fontSize: 20, fontWeight: "900" },
  categoryName: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  photoTile: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 22, borderStyle: "dashed", borderWidth: 2, justifyContent: "center", overflow: "hidden" },
  primaryPhoto: { height: 260 },
  photo: { height: "100%", width: "100%" },
  photoPlus: { color: colors.primary, fontSize: 44 },
  supportingRow: { flexDirection: "row", gap: 10 },
  supportingTile: { borderRadius: 14, height: 90, overflow: "hidden", width: 90 },
  loadingBox: { alignItems: "center", gap: 12, padding: 30 },
  map: { borderRadius: 22, height: 300, overflow: "hidden" },
  addressInput: { minHeight: 74, textAlignVertical: "top" },
  notice: { backgroundColor: "#FFF4D8", borderRadius: 12, color: "#71520D", fontSize: 14, lineHeight: 20, padding: 13 },
  centered: { justifyContent: "center" },
  centerText: { textAlign: "center" },
  feedbackIcon: { alignItems: "center", alignSelf: "center", backgroundColor: "#FFF4D8", borderRadius: 40, height: 80, justifyContent: "center", width: 80 },
  feedbackIconText: { color: "#8C6200", fontSize: 38, fontWeight: "800" },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: "center" },
  error: { color: colors.danger, fontSize: 15, lineHeight: 21 },
  success: { alignItems: "center", alignSelf: "center", backgroundColor: colors.primarySoft, borderRadius: 44, height: 88, justifyContent: "center", width: 88 },
  successText: { color: colors.primary, fontSize: 42, fontWeight: "900" },
  idCard: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 18, gap: 8, padding: 18 },
  ticketId: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  ticketCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, gap: 10, marginBottom: 12, padding: 18 },
  ticketTop: { alignItems: "flex-start", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  status: { backgroundColor: colors.primarySoft, borderRadius: 20, color: colors.primary, fontSize: 12, fontWeight: "800", overflow: "hidden", paddingHorizontal: 10, paddingVertical: 6 },
  validationBanner: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primary, borderRadius: 22, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", padding: 18 },
  bannerArrow: { color: colors.primary, fontSize: 34, fontWeight: "500" },
  mobileTabs: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flexDirection: "row", marginTop: 8, padding: 4 },
  mobileTab: { alignItems: "center", borderRadius: 12, flex: 1, paddingVertical: 11 },
  mobileTabActive: { backgroundColor: colors.primary },
  mobileTabText: { color: colors.muted, fontSize: 13, fontWeight: "800" },
  mobileTabTextActive: { color: "white", fontSize: 13, fontWeight: "800" },
  validationPhoto: { backgroundColor: colors.surface, borderRadius: 22, height: 320, overflow: "hidden" },
  validationActions: { gap: 12 },
  voteButton: { alignItems: "center", borderRadius: 16, borderWidth: 1.5, padding: 16 },
  voteConfirm: { backgroundColor: colors.primary, borderColor: colors.primary },
  voteNeutral: { backgroundColor: colors.surface, borderColor: colors.border },
  voteReject: { backgroundColor: "#FFF1F1", borderColor: colors.danger },
  voteLabel: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  voteConfirmLabel: { color: colors.surface },
  voteRejectLabel: { color: colors.danger },
  disabled: { opacity: 0.45 },
});
