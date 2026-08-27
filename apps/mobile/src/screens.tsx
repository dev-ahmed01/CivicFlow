import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CategorySummary, CitizenGrievanceReason, CitizenTicketSummary, CitizenTicketTimelineResponse, CompletionVerificationDecision, PendingCompletionVerification, PendingValidation, ValidationVote } from "@civicos/shared";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import MapView, { Marker } from "react-native-maps";
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { requestCitizenOtp, verifyCitizenOtp, type CurrentAuth, type LocalImage } from "./api";
import { CategoryGrid, PrimaryButton, ScreenHeader, SecondaryButton, StatusChip, TicketCard } from "./components";
import { colors, fontWeights, radii, typeScale } from "./theme";

export function Shell({ children }: { children: ReactNode }) { return <SafeAreaView style={styles.safe}><View style={styles.shell}>{children}</View></SafeAreaView>; }

export function CitizenLoginScreen({ onAuthenticated, onBack }: { onAuthenticated: (auth: CurrentAuth) => void; onBack: () => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [demoMode, setDemoMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async () => {
    setBusy(true); setError(undefined);
    try {
      if (step === "phone") { const result = await requestCitizenOtp(phone); setDemoMode(result.demoMode); setStep("code"); }
      else onAuthenticated(await verifyCitizenOtp(phone, code));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not sign in"); }
    finally { setBusy(false); }
  };
  return <Shell><ScrollView contentContainerStyle={styles.content}><ScreenHeader eyebrow={step === "phone" ? "Citizen sign in" : "Verify phone"} title={step === "phone" ? "Your city, one tap away" : "Enter the 6-digit code"} onBack={step === "code" ? () => setStep("phone") : onBack} /><Text style={styles.body}>{step === "phone" ? "Use your verified mobile number to report issues and follow their progress." : demoMode ? "Demo authentication is active. Enter the rehearsal code supplied by the presenter." : `We sent a one-time code to ${phone}.`}</Text>{step === "phone" ? <TextInput accessibilityLabel="Mobile number" keyboardType="phone-pad" value={phone} onChangeText={setPhone} placeholder="+91 98765 43210" placeholderTextColor={colors.muted} style={styles.input} /> : <TextInput accessibilityLabel="One-time code" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} placeholder="6-digit code" placeholderTextColor={colors.muted} style={styles.input} />}{error ? <Text style={styles.error}>{error}</Text> : null}<PrimaryButton disabled={busy || (step === "phone" ? phone.length < 10 : code.length !== 6)} onPress={() => void submit()}>{busy ? "Please wait…" : step === "phone" ? "Send verification code" : "Verify and continue"}</PrimaryButton>{step === "code" ? <SecondaryButton disabled={busy} onPress={() => void requestCitizenOtp(phone)}>Send a new code</SecondaryButton> : null}</ScrollView></Shell>;
}

export function HomeScreen({ signedIn, onSignIn, onReport, onTickets, onValidations, onCompletionValidations, onEngineerLogin }: { signedIn: boolean; onSignIn: () => void; onReport: () => void; onTickets: (filter: "ongoing" | "past") => void; onValidations: () => void; onCompletionValidations: () => void; onEngineerLogin: () => void }) {
  return <Shell><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.brand}><Text style={styles.brandMark}>C</Text><Text style={styles.brandName}>CivicOS</Text></View>
    <View style={styles.hero}><Text style={styles.kicker}>Your city, heard</Text><Text style={styles.heroTitle}>Spot a civic issue?</Text><Text style={styles.body}>Share a photo and location. We’ll keep you updated in plain language.</Text><PrimaryButton onPress={onReport}>Report an Issue</PrimaryButton></View>
    <Pressable accessibilityRole="button" style={styles.validationBanner} onPress={onValidations}><View><Text style={styles.kicker}>Community check</Text><Text style={styles.cardTitle}>Nearby verification requests</Text><Text style={styles.cardHint}>Help confirm an issue close to you</Text></View><Text style={styles.bannerArrow}>›</Text></Pressable>
    <Pressable accessibilityRole="button" style={styles.validationBanner} onPress={onCompletionValidations}><View><Text style={styles.kicker}>Completion check</Text><Text style={styles.cardTitle}>Verify completed work</Text><Text style={styles.cardHint}>Review evidence for issues you validated</Text></View><Text style={styles.bannerArrow}>›</Text></Pressable>
    <Text style={styles.sectionTitle}>My tickets</Text><View style={styles.row}>
      <Pressable style={styles.statCard} onPress={() => onTickets("ongoing")}><Text style={styles.statIcon}>◷</Text><Text style={styles.cardTitle}>Ongoing</Text><Text style={styles.cardHint}>Track current reports</Text></Pressable>
      <Pressable style={styles.statCard} onPress={() => onTickets("past")}><Text style={styles.statIcon}>✓</Text><Text style={styles.cardTitle}>Past</Text><Text style={styles.cardHint}>See closed reports</Text></Pressable>
    </View>{!signedIn ? <PrimaryButton onPress={onSignIn}>Sign in with phone</PrimaryButton> : null}<SecondaryButton onPress={onEngineerLogin}>Executive Engineer sign in</SecondaryButton>
  </ScrollView></Shell>;
}

export function CitizenProfileScreen({ signedIn, onSignIn, onSignOut }: { signedIn: boolean; onSignIn: () => void; onSignOut: () => void }) {
  return <Shell><ScrollView contentContainerStyle={styles.content}><ScreenHeader eyebrow="Account" title="Citizen profile" /><View style={styles.ticketCard}><Text style={styles.cardTitle}>{signedIn ? "Phone verified" : "Sign in to continue"}</Text><Text style={styles.body}>{signedIn ? "Your reports and verification activity stay connected to your verified account." : "A verified phone number is required before reporting or reviewing nearby work."}</Text></View><View style={styles.ticketCard}><Text style={styles.kicker}>Privacy</Text><Text style={styles.body}>CivicOS shows public outcomes without exposing citizen names or individual account details.</Text></View>{signedIn ? <SecondaryButton onPress={onSignOut}>Sign out</SecondaryButton> : <PrimaryButton onPress={onSignIn}>Sign in with phone</PrimaryButton>}</ScrollView></Shell>;
}

export function CategoryScreen({ categories, selectedId, onSelect, onBack, loading, error }: { categories: CategorySummary[]; selectedId?: string; onSelect: (category: CategorySummary) => void; onBack: () => void; loading: boolean; error?: string }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => categories.filter((category) => category.name.toLowerCase().includes(query.toLowerCase())), [categories, query]);
  return <Shell><ScrollView contentContainerStyle={styles.content}><ScreenHeader eyebrow="Step 1 of 4" title="What needs attention?" onBack={onBack} />
    <TextInput accessibilityLabel="Search issue categories" placeholder="Search issue types" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} style={styles.input} />
    {loading ? <ActivityIndicator color={colors.primary} /> : null}{error ? <Text style={styles.error}>{error}</Text> : null}
    <CategoryGrid categories={filtered} selectedId={selectedId} onSelect={onSelect} />
  </ScrollView></Shell>;
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
export function ConfirmationScreen({ ticket, onView, onDone }: { ticket: CitizenTicketSummary; onView: () => void; onDone: () => void }) { return <Shell><View style={[styles.content, styles.centered]}><View style={styles.success}><Text style={styles.successText}>✓</Text></View><Text style={styles.kicker}>Report submitted</Text><Text style={[styles.heroTitle, styles.centerText]}>{ticket.title}</Text><View style={styles.idCard}><Text style={styles.hint}>Ticket No.</Text><Text selectable style={styles.ticketId}>{ticket.referenceNumber}</Text></View><PrimaryButton onPress={onView}>View Ticket</PrimaryButton><SecondaryButton onPress={onDone}>Done</SecondaryButton></View></Shell>; }
export function TicketDetailScreen({ ticket, timeline, loading, error, onRefresh, onDone, onRaiseGrievance }: { ticket: CitizenTicketSummary; timeline?: CitizenTicketTimelineResponse; loading: boolean; error?: string; onRefresh: () => void; onDone: () => void; onRaiseGrievance: () => void }) { return <Shell><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={colors.primary} />}><ScreenHeader title={ticket.title} onBack={onDone} />{error ? <Text style={styles.error}>{error}</Text> : null}<StatusChip label={ticket.statusLabel} /><TicketCard id={ticket.id} referenceNumber={ticket.referenceNumber} category={ticket.category.name} status={ticket.statusLabel} relativeDate={`Updated ${new Date(ticket.updatedAt).toLocaleDateString("en-IN")}`} meta={`${ticket.address} · ${ticket.observationCount} community ${ticket.observationCount === 1 ? "report" : "reports"}`} />{timeline?.timeline.length ? <View style={styles.ticketCard}><Text style={styles.kicker}>Progress</Text>{timeline.timeline.map((item, index) => <View key={`${item.status}-${index}`}><Text style={styles.cardTitle}>{item.label}</Text><Text style={styles.cardHint}>{new Date(item.at).toLocaleString("en-IN")}</Text></View>)}</View> : null}{timeline?.notes.length ? <View style={styles.ticketCard}><Text style={styles.kicker}>Updates from the team</Text>{timeline.notes.map((note) => <View key={note.id}><Text style={styles.cardTitle}>{note.label}</Text><Text style={styles.body}>{note.text}</Text><Text style={styles.cardHint}>{new Date(note.at).toLocaleString("en-IN")}</Text></View>)}</View> : null}{timeline?.grievances.length ? <View style={styles.ticketCard}><Text style={styles.kicker}>Grievance status</Text>{timeline.grievances.map((grievance) => <View key={grievance.id}><Text style={styles.cardTitle}>{grievance.status.replaceAll("_", " ")}</Text><Text style={styles.body}>{grievance.reason.replaceAll("_", " ")}</Text><Text style={styles.cardHint}>Created {new Date(grievance.createdAt).toLocaleDateString("en-IN")}</Text></View>)}</View> : null}{timeline?.canRaiseGrievance ? <SecondaryButton onPress={onRaiseGrievance}>Raise a grievance</SecondaryButton> : null}<PrimaryButton onPress={onDone}>Done</PrimaryButton></ScrollView></Shell>; }

const grievanceReasons: Array<{ value: CitizenGrievanceReason; label: string }> = [
  { value: "WORK_INCOMPLETE", label: "Work is incomplete" },
  { value: "INCORRECT_CLOSURE", label: "Closure is incorrect" },
  { value: "ISSUE_UNRESOLVED", label: "Issue remains unresolved" },
  { value: "POOR_EXECUTION_QUALITY", label: "Execution quality is poor" },
];

export function GrievanceScreen({ submitting, onBack, onSubmit }: { submitting: boolean; onBack: () => void; onSubmit: (reason: CitizenGrievanceReason, note?: string, evidence?: LocalImage) => void }) {
  const [reason, setReason] = useState<CitizenGrievanceReason>("WORK_INCOMPLETE");
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<LocalImage>();
  const pickEvidence = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (!result.canceled && result.assets[0]) setEvidence(normalizeAsset(result.assets[0]));
  };
  return <Shell><ScrollView contentContainerStyle={styles.content}><ScreenHeader eyebrow="Citizen grievance" title="Tell us what remains wrong" onBack={onBack} /><Text style={styles.body}>This creates an internal CivicFlow grievance linked to your original ticket.</Text><View style={styles.validationActions}>{grievanceReasons.map((item) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: reason === item.value }} key={item.value} onPress={() => setReason(item.value)} style={[styles.voteButton, reason === item.value && styles.voteConfirm]}><Text style={styles.voteLabel}>{item.label}</Text></Pressable>)}</View><TextInput accessibilityLabel="Optional grievance note" multiline onChangeText={setNote} placeholder="Add an optional note" style={[styles.input, styles.addressInput]} value={note} /><SecondaryButton onPress={() => void pickEvidence()}>{evidence ? "Change evidence image" : "Add evidence image (optional)"}</SecondaryButton>{evidence ? <Image source={{ uri: evidence.uri }} resizeMode="cover" style={styles.photo} /> : null}<PrimaryButton disabled={submitting} onPress={() => onSubmit(reason, note.trim() || undefined, evidence)}>{submitting ? "Submitting…" : "Submit Grievance"}</PrimaryButton></ScrollView></Shell>;
}
export function TicketsScreen({ filter, tickets, loading, error, onBack, onOpen }: { filter: "ongoing" | "past"; tickets: CitizenTicketSummary[]; loading: boolean; error?: string; onBack: () => void; onOpen: (ticket: CitizenTicketSummary) => void }) { return <Shell><View style={styles.content}><ScreenHeader title={filter === "ongoing" ? "Ongoing tickets" : "Past tickets"} onBack={onBack} />{loading ? <ActivityIndicator color={colors.primary} /> : null}{error ? <Text style={styles.error}>{error}</Text> : null}<FlatList data={tickets} keyExtractor={(item) => item.id} ListEmptyComponent={!loading ? <Text style={styles.body}>No {filter} tickets yet.</Text> : null} renderItem={({ item }) => <TicketCard id={item.id} referenceNumber={item.referenceNumber} category={item.category.name} status={item.statusLabel} relativeDate={new Date(item.updatedAt).toLocaleDateString("en-IN")} title={item.title} meta={item.address} onPress={() => onOpen(item)} />} /></View></Shell>; }

export function VerificationListScreen({ validations, loading, error, onBack, onOpen }: { validations: PendingValidation[]; loading: boolean; error?: string; onBack: () => void; onOpen: (validation: PendingValidation) => void }) {
  return <Shell><View style={styles.content}><ScreenHeader eyebrow="Community validation" title="Community Validation" onBack={onBack} />{loading ? <ActivityIndicator color={colors.primary} /> : null}{error ? <Text style={styles.error}>{error}</Text> : null}<FlatList data={validations} keyExtractor={(item) => item.ticketId} ListEmptyComponent={!loading ? <Text style={styles.body}>No community requests need your help right now.</Text> : null} renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => onOpen(item)} style={styles.ticketCard}><Text style={styles.kicker}>{item.category.name}</Text><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.cardHint}>{item.address}</Text><Text style={styles.cardHint}>{item.confirmationCount}/{item.quorum} confirmed</Text></Pressable>} /></View></Shell>;
}

const validationActions: Array<{ vote: ValidationVote; label: string; style: "confirm" | "neutral" | "reject" }> = [
  { vote: "CONFIRM", label: "Confirm", style: "confirm" },
  { vote: "NOT_SURE", label: "Not sure", style: "neutral" },
  { vote: "REJECT", label: "Reject", style: "reject" },
];

export function VerificationRequestScreen({ validation, submitting, onBack, onSubmit }: { validation: PendingValidation; submitting: boolean; onBack: () => void; onSubmit: (vote: ValidationVote) => void }) {
  return <Shell><ScrollView contentContainerStyle={styles.content}><ScreenHeader eyebrow="Community validation request" title="Can you confirm this?" onBack={onBack} /><View style={styles.validationPhoto}><Image source={{ uri: validation.imageUrl }} resizeMode="cover" style={styles.photo} /></View><View style={styles.ticketCard}><Text style={styles.kicker}>{validation.category.name}</Text><Text style={styles.cardTitle}>{validation.title}</Text><Text style={styles.cardHint}>{validation.address}</Text><Text style={styles.cardHint}>{validation.confirmationCount}/{validation.quorum} confirmations</Text></View><Text style={styles.body}>Confirm if this issue exists at the shown location, or reject it if it does not.</Text><View style={styles.validationActions}>{validationActions.map((action) => <Pressable accessibilityRole="button" disabled={submitting} key={action.vote} onPress={() => onSubmit(action.vote)} style={[styles.voteButton, action.style === "confirm" ? styles.voteConfirm : action.style === "reject" ? styles.voteReject : styles.voteNeutral, submitting && styles.disabled]}><Text style={[styles.voteLabel, action.style === "confirm" ? styles.voteConfirmLabel : action.style === "reject" ? styles.voteRejectLabel : undefined]}>{action.label}</Text></Pressable>)}</View></ScrollView></Shell>;
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
  brandMark: { backgroundColor: colors.primarySoft, borderRadius: 12, color: colors.primary, fontSize: 22, fontWeight: "500", overflow: "hidden", paddingHorizontal: 12, paddingVertical: 7 },
  brandName: { color: colors.ink, fontSize: 22, fontWeight: "500" },
  hero: { backgroundColor: colors.surface, borderRadius: 26, gap: 16, marginTop: 28, padding: 24 },
  kicker: { color: colors.primary, fontSize: 12, fontWeight: "500" },
  heroTitle: { color: colors.ink, fontSize: 22, fontWeight: "500" },
  body: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: "500", marginTop: 12 },
  row: { flexDirection: "row", gap: 12 },
  statCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flex: 1, gap: 6, padding: 18 },
  statIcon: { color: colors.primary, fontSize: 22, fontWeight: "500" },
  cardTitle: { color: colors.ink, flexShrink: 1, fontSize: 16, fontWeight: "500" },
  cardHint: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 15, borderWidth: 1, color: colors.ink, fontSize: 16, paddingHorizontal: 16, paddingVertical: 14 },
  photoTile: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 22, borderStyle: "dashed", borderWidth: 2, justifyContent: "center", overflow: "hidden" },
  primaryPhoto: { height: 260 },
  photo: { height: "100%", width: "100%" },
  photoPlus: { color: colors.primary, fontSize: 44 },
  supportingRow: { flexDirection: "row", gap: 10 },
  supportingTile: { borderRadius: 14, height: 90, overflow: "hidden", width: 90 },
  loadingBox: { alignItems: "center", gap: 12, padding: 30 },
  map: { borderRadius: 22, height: 300, overflow: "hidden" },
  addressInput: { minHeight: 74, textAlignVertical: "top" },
  notice: { backgroundColor: colors.warningBg, borderRadius: radii.card, color: colors.warningText, fontSize: typeScale.body, lineHeight: 20, padding: 13 },
  centered: { justifyContent: "center" },
  centerText: { textAlign: "center" },
  feedbackIcon: { alignItems: "center", alignSelf: "center", backgroundColor: colors.warningBg, borderRadius: 40, height: 80, justifyContent: "center", width: 80 },
  feedbackIconText: { color: colors.warningText, fontSize: 38, fontWeight: fontWeights.medium },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: "center" },
  error: { color: colors.danger, fontSize: 15, lineHeight: 21 },
  success: { alignItems: "center", alignSelf: "center", backgroundColor: colors.primarySoft, borderRadius: 44, height: 88, justifyContent: "center", width: 88 },
  successText: { color: colors.primary, fontSize: 22, fontWeight: "500" },
  idCard: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 18, gap: 8, padding: 18 },
  ticketId: { color: colors.ink, fontSize: 14, fontWeight: "500" },
  ticketCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, gap: 10, marginBottom: 12, padding: 18 },
  ticketTop: { alignItems: "flex-start", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  status: { backgroundColor: colors.successBg, borderRadius: 20, color: colors.successText, fontSize: 12, fontWeight: "500", overflow: "hidden", paddingHorizontal: 10, paddingVertical: 6 },
  validationBanner: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primary, borderRadius: 22, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", padding: 18 },
  bannerArrow: { color: colors.primary, fontSize: 34, fontWeight: "500" },
  validationPhoto: { backgroundColor: colors.surface, borderRadius: 22, height: 320, overflow: "hidden" },
  validationActions: { gap: 12 },
  voteButton: { alignItems: "center", borderRadius: 16, borderWidth: 1.5, padding: 16 },
  voteConfirm: { backgroundColor: colors.primary, borderColor: colors.primary },
  voteNeutral: { backgroundColor: colors.surface, borderColor: colors.border },
  voteReject: { backgroundColor: colors.dangerBg, borderColor: colors.danger },
  voteLabel: { color: colors.ink, fontSize: 16, fontWeight: "500" },
  voteConfirmLabel: { color: colors.surface },
  voteRejectLabel: { color: colors.danger },
  disabled: { opacity: 0.45 },
});
