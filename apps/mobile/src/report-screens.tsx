import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CategorySummary, CitizenTicketSummary } from "@civicos/shared";
import { Camera, Map, Marker } from "@maplibre/maplibre-react-native";
import * as ImagePicker from "expo-image-picker";
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { LocalImage } from "./api";
import { AppIcon, Card, CategoryGrid, PrimaryButton, ScreenHeader, SecondaryButton, StatusChip } from "./components";
import { mapStyleUrl } from "./map-config";
import { detectCurrentLocation, type ConfirmedLocation } from "./report-location";
import { pickerRequiresMediaLibraryPermission } from "./platform";
import { Shell, useResponsiveMetrics } from "./screen-shell";
import { colors, fontWeights, radii } from "./theme";

export type { ConfirmedLocation } from "./report-location";

const reportSteps = ["Category", "Photo", "Detect", "Confirm", "Review", "Submit"];

function ReportProgress({ step }: { step: number }) {
  return <View accessibilityLabel={`Report step ${step} of ${reportSteps.length}`} style={styles.progressWrap}><View style={styles.progressTop}><Text style={styles.progressText}>Step {step} of {reportSteps.length}</Text><Text style={styles.progressLabel}>{reportSteps[step - 1]}</Text></View><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${(step / reportSteps.length) * 100}%` }]} /></View></View>;
}

export function CategoryScreen({ categories, selectedId, onSelect, onBack, loading, error }: { categories: CategorySummary[]; selectedId?: string; onSelect: (category: CategorySummary) => void; onBack: () => void; loading: boolean; error?: string }) {
  const [query, setQuery] = useState("");
  const { horizontalPadding } = useResponsiveMetrics();
  const filtered = useMemo(() => categories.filter((category) => category.name.toLowerCase().includes(query.toLowerCase())), [categories, query]);
  return <Shell><ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: horizontalPadding }]} keyboardShouldPersistTaps="handled"><ScreenHeader title="What needs attention?" subtitle="Choose the category that best matches the issue." onBack={onBack} /><ReportProgress step={1} /><View style={styles.search}><AppIcon color={colors.muted} name="search-outline" size={19} /><TextInput accessibilityLabel="Search issue categories" onChangeText={setQuery} placeholder="Search issue types" placeholderTextColor={colors.muted} style={styles.searchInput} value={query} /></View>{loading ? <ActivityIndicator color={colors.primary} /> : null}{error ? <Text style={styles.error}>{error}</Text> : null}<CategoryGrid categories={filtered} selectedId={selectedId} onSelect={onSelect} /></ScrollView></Shell>;
}

export function normalizeAsset(asset: ImagePicker.ImagePickerAsset): LocalImage {
  const extension = asset.uri.split(".").pop()?.toLowerCase();
  const contentType = asset.mimeType === "image/png" || extension === "png" ? "image/png" : asset.mimeType === "image/webp" || extension === "webp" ? "image/webp" : asset.mimeType === "image/heic" || asset.mimeType === "image/heif" || extension === "heic" || extension === "heif" ? "image/heic" : "image/jpeg";
  return { uri: asset.uri, fileName: asset.fileName ?? `city-connect-${Date.now()}.${extension ?? "jpg"}`, contentType };
}

async function canOpenPicker(source: "camera" | "gallery"): Promise<boolean> {
  // Android's system photo picker grants access only to selected files and does
  // not require READ_MEDIA_IMAGES on Android 13+.
  if (source === "gallery" && !pickerRequiresMediaLibraryPermission(Platform.OS)) return true;
  const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (permission.granted) return true;
  Alert.alert(source === "camera" ? "Camera permission needed" : "Photo access needed", source === "camera" ? "Enable camera access in Android settings to take a civic issue photo." : "Enable photo access in settings, then choose the image again.");
  return false;
}

export function EvidenceScreen({ images, checking, checkError, onChange, onNext, onBack }: { images: LocalImage[]; checking: boolean; checkError?: string; onChange: (images: LocalImage[]) => void; onNext: () => void; onBack: () => void }) {
  const { horizontalPadding, narrow } = useResponsiveMetrics();
  const pick = async (source: "camera" | "gallery") => {
    try {
      if (!(await canOpenPicker(source))) return;
      const result = source === "camera" ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85, exif: true }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85, allowsMultipleSelection: true, selectionLimit: Math.max(1, 4 - images.length), exif: true });
      if (!result.canceled) onChange([...images, ...result.assets.map(normalizeAsset)].slice(0, 4));
    } catch {
      Alert.alert("Couldn’t open photos", `City Connect could not open the ${source}. Please try again or use the other photo option.`);
    }
  };
  const remove = (index: number) => onChange(images.filter((_image, imageIndex) => imageIndex !== index));
  return <Shell><ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: horizontalPadding }]}><ScreenHeader title="Show us the issue" subtitle="A clear photo helps the right team understand the problem." onBack={onBack} /><ReportProgress step={2} /><Pressable accessibilityRole="button" onPress={() => void pick(images[0] ? "gallery" : "camera")} style={[styles.photoTile, styles.primaryPhoto]}>{images[0] ? <><Image source={{ uri: images[0].uri }} style={styles.photo} /><View style={styles.photoOverlay}><Text style={styles.photoOverlayText}>Primary evidence</Text></View></> : <View style={styles.photoPrompt}><View style={styles.cameraCircle}><AppIcon color={colors.primary} name="camera" size={29} /></View><Text style={styles.photoTitle}>Add a clear main photo</Text><Text style={styles.photoHint}>Make sure the civic issue is visible</Text></View>}</Pressable><View style={[styles.photoActions, narrow && styles.photoActionsNarrow]}><SecondaryButton icon="camera-outline" onPress={() => void pick("camera")}>Take Photo</SecondaryButton><SecondaryButton icon="images-outline" onPress={() => void pick("gallery")}>Choose from Gallery</SecondaryButton></View>{images.length ? <View style={styles.thumbnailRow}>{images.map((image, index) => <View key={`${image.uri}-${index}`} style={styles.thumbnail}><Image source={{ uri: image.uri }} style={styles.photo} /><Pressable accessibilityLabel={`Remove photo ${index + 1}`} onPress={() => remove(index)} style={styles.removePhoto}><AppIcon color={colors.surface} name="close" size={14} /></Pressable></View>)}{images.length < 4 ? <Pressable onPress={() => void pick("gallery")} style={styles.addTile}><AppIcon color={colors.primary} name="add" size={25} /></Pressable> : null}</View> : null}<Text style={styles.helper}><AppIcon color={colors.muted} name="shield-checkmark-outline" size={15} /> The main photo is checked before a report is created. Supporting photos are preserved.</Text>{checkError ? <Text role="alert" style={styles.error}>{checkError}</Text> : null}<PrimaryButton disabled={!images[0] || checking} icon="arrow-forward" onPress={onNext}>{checking ? "Checking photo…" : "Check photo and continue"}</PrimaryButton></ScrollView></Shell>;
}

export function LocationDetectScreen({ onDetected, onBack }: { onDetected: (location: ConfirmedLocation) => void; onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const { horizontalPadding } = useResponsiveMetrics();
  const detect = useCallback(async () => {
    setLoading(true); setError(undefined);
    try { onDetected(await detectCurrentLocation()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "We couldn’t detect your location. Please try again."); }
    finally { setLoading(false); }
  }, [onDetected]);
  useEffect(() => { void detect(); }, [detect]);
  return <Shell><ScrollView contentContainerStyle={[styles.content, styles.detectContent, { paddingHorizontal: horizontalPadding }]}><ScreenHeader title="Detecting your location" subtitle="City Connect uses your location to identify the ward and responsible agency." onBack={onBack} /><ReportProgress step={3} /><View style={styles.locationVisual}><View style={styles.locationPulse}><AppIcon color={colors.surface} name="locate" size={36} /></View><View style={styles.locationRing} /></View>{loading ? <View style={styles.detectStatus}><ActivityIndicator color={colors.primary} /><Text style={styles.body}>Finding your current GPS position…</Text></View> : null}{error ? <Card style={styles.errorCard}><AppIcon color={colors.danger} name="location-outline" size={24} /><Text style={styles.errorTitle}>Location unavailable</Text><Text style={styles.error}>{error}</Text><PrimaryButton icon="refresh" onPress={() => void detect()}>Try again</PrimaryButton></Card> : null}</ScrollView></Shell>;
}

class MapRenderBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch() {
    // The coordinate confirmation UI remains available below the map fallback.
  }

  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function MapFallback({ value }: { value: ConfirmedLocation }) {
  return <View accessibilityLabel="Map unavailable; detected location details" style={styles.mapFallback}><AppIcon color={colors.primary} name="location" size={29} /><Text style={styles.errorTitle}>Detected location</Text><Text style={styles.fallbackAddress}>Address: {value.address}</Text><Text style={styles.coordinateText}>Latitude: {value.latitude.toFixed(6)}</Text><Text style={styles.coordinateText}>Longitude: {value.longitude.toFixed(6)}</Text><Text style={styles.photoHint}>The map could not be displayed. You can still confirm these GPS coordinates.</Text></View>;
}

function LocationMap({ value, adjusting, onChange }: { value: ConfirmedLocation; adjusting: boolean; onChange: (location: ConfirmedLocation) => void }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => { if (!loaded) setFailed(true); }, 10_000);
    return () => clearTimeout(timer);
  }, [loaded]);
  if (failed) return <MapFallback value={value} />;
  const movePin = (lngLat: [number, number]) => onChange({ ...value, longitude: lngLat[0], latitude: lngLat[1], confidenceLow: false });
  return <Map androidView="texture" attribution attributionPosition={{ bottom: 8, right: 8 }} compass={false} logo={false} mapStyle={mapStyleUrl} onDidFailLoadingMap={() => setFailed(true)} onDidFinishLoadingMap={() => setLoaded(true)} onPress={adjusting ? (event) => movePin(event.nativeEvent.lngLat) : undefined} style={styles.map}><Camera center={[value.longitude, value.latitude]} zoom={16} /><Marker id="detected-location" lngLat={[value.longitude, value.latitude]}><View style={styles.mapMarker}><View style={styles.mapMarkerCore} /></View></Marker></Map>;
}

export function LocationConfirmScreen({ value, confirming, onChange, onNext, onRetry, onBack }: { value: ConfirmedLocation; confirming: boolean; onChange: (location: ConfirmedLocation) => void; onNext: () => void; onRetry: () => void; onBack: () => void }) {
  const [adjusting, setAdjusting] = useState(false);
  const { horizontalPadding } = useResponsiveMetrics();
  const fallback = <MapFallback value={value} />;
  return <Shell><ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: horizontalPadding }]} keyboardShouldPersistTaps="handled"><ScreenHeader title="Confirm the location" subtitle="Check the pin and address before continuing." onBack={onBack} /><ReportProgress step={4} /><View style={styles.mapWrap}><MapRenderBoundary fallback={fallback} key={`${value.latitude}:${value.longitude}`}><LocationMap adjusting={adjusting && !confirming} onChange={confirming ? () => undefined : onChange} value={value} /></MapRenderBoundary><View pointerEvents="none" style={styles.mapStatus}><AppIcon color={colors.successText} name="checkmark-circle" size={16} /><Text style={styles.mapStatusText}>GPS location detected</Text></View></View><Card><Text style={styles.inputLabel}>Detected address</Text><TextInput accessibilityLabel="Issue address" editable={!confirming} multiline onChangeText={(address) => onChange({ ...value, address })} style={[styles.input, styles.addressInput]} value={value.address} /><View style={styles.coordinates}><Text style={styles.coordinateText}>{value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}</Text><Pressable disabled={confirming} onPress={onRetry}><Text style={styles.retryText}>Retry location</Text></Pressable></View></Card>{value.geocodeFailed ? <Text style={styles.notice}>The address lookup is unavailable. Your GPS coordinates are preserved; retry location or continue with them.</Text> : value.confidenceLow ? <Text style={styles.notice}>The GPS reading may be approximate. Adjust the pin or edit the address.</Text> : null}<SecondaryButton disabled={confirming} icon="pin-outline" onPress={() => setAdjusting((current) => !current)}>{adjusting ? "Finish adjusting" : "Adjust map pin"}</SecondaryButton><PrimaryButton disabled={confirming} icon="arrow-forward" onPress={onNext}>{confirming ? "Checking reporting area…" : "Confirm location"}</PrimaryButton></ScrollView></Shell>;
}

export function ReviewReportScreen({ category, image, location, submitting, onBack, onSubmit }: { category: CategorySummary; image: LocalImage; location: ConfirmedLocation; submitting: boolean; onBack: () => void; onSubmit: () => void }) {
  const { horizontalPadding } = useResponsiveMetrics();
  return <Shell><ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: horizontalPadding }]}><ScreenHeader title="Review your report" subtitle="Make sure these details are correct before submitting." onBack={onBack} /><ReportProgress step={5} /><Card style={styles.reviewCard}><Image source={{ uri: image.uri }} style={styles.reviewPhoto} /><View style={styles.reviewSection}><Text style={styles.reviewLabel}>ISSUE CATEGORY</Text><Text style={styles.reviewValue}>{category.name}</Text></View><View style={styles.reviewDivider} /><View style={styles.reviewLocation}><AppIcon color={colors.primary} name="location" size={21} /><View style={styles.reviewCopy}><Text style={styles.reviewLabel}>LOCATION</Text><Text style={styles.reviewValue}>{location.address}</Text><Text style={styles.coordinateText}>{location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</Text></View></View></Card><View style={styles.submitNotice}><AppIcon color={colors.primary} name="people-outline" size={21} /><Text style={styles.submitNoticeText}>After submission, your report will wait for community validation before reaching the responsible agency.</Text></View><ReportProgress step={6} /><PrimaryButton disabled={submitting} icon="send" onPress={onSubmit}>{submitting ? "Submitting securely…" : "Submit report"}</PrimaryButton></ScrollView></Shell>;
}

export function RetakeScreen({ attemptsRemaining, reason, onSelected }: { attemptsRemaining: number; reason: string; onSelected: (image: LocalImage) => void }) {
  const { horizontalPadding } = useResponsiveMetrics();
  const pick = async (source: "camera" | "gallery") => {
    try {
      if (!(await canOpenPicker(source))) return;
      const result = source === "camera" ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85, exif: true }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85, selectionLimit: 1 });
      if (!result.canceled && result.assets[0]) onSelected(normalizeAsset(result.assets[0]));
    } catch {
      Alert.alert("Couldn’t open photos", `City Connect could not open the ${source}. Please try again or use the other photo option.`);
    }
  };
  return <Shell><ScrollView contentContainerStyle={[styles.content, styles.centered, { paddingHorizontal: horizontalPadding }]}><View style={styles.feedbackIcon}><AppIcon color={colors.warningText} name="camera-reverse-outline" size={38} /></View><ScreenHeader title="This photo can’t be used." subtitle={reason} />{attemptsRemaining > 0 ? <Text style={styles.centerHint}>{attemptsRemaining} photo {attemptsRemaining === 1 ? "try" : "tries"} remaining in this check.</Text> : <Text style={styles.centerHint}>Choose a clearer photo to try again.</Text>}<PrimaryButton icon="camera" onPress={() => void pick("camera")}>Take Another Photo</PrimaryButton><SecondaryButton icon="images-outline" onPress={() => void pick("gallery")}>Choose from Gallery</SecondaryButton></ScrollView></Shell>;
}

export function ConfirmationScreen({ ticket, image, location, onView, onDone }: { ticket: CitizenTicketSummary; image: LocalImage; location: ConfirmedLocation; onView: () => void; onDone: () => void }) {
  const { horizontalPadding } = useResponsiveMetrics();
  return <Shell><ScrollView contentContainerStyle={[styles.content, styles.confirmation, { paddingHorizontal: horizontalPadding }]}><View style={styles.success}><AppIcon color={colors.surface} name="checkmark" size={30} /></View><Text style={styles.successKicker}>REPORT SUBMITTED</Text><Text style={styles.confirmTitle}>We’ve received your report</Text><Text style={styles.centerBody}>You can track every step from your City Connect account.</Text><Card style={styles.confirmCard}><Image source={{ uri: image.uri }} style={styles.confirmPhoto} /><View style={styles.ticketRow}><View><Text style={styles.reviewLabel}>TICKET ID</Text><Text selectable style={styles.ticketNumber}>{ticket.referenceNumber}</Text></View><StatusChip label={ticket.statusLabel} /></View><Text style={styles.reviewValue}>{ticket.category.name}</Text><View style={styles.reviewLocation}><AppIcon color={colors.muted} name="location-outline" size={18} /><Text style={[styles.body, styles.reviewCopy]}>{location.address}</Text></View></Card><View style={styles.nextStep}><View style={styles.nextStepLine} /><View style={styles.nextStepDot}><AppIcon color={colors.surface} name="people" size={18} /></View><View style={styles.reviewCopy}><Text style={styles.reviewLabel}>NEXT EXPECTED STEP</Text><Text style={styles.nextStepTitle}>Waiting for community validation</Text><Text style={styles.photoHint}>The required community confirmation will move this report to the responsible agency.</Text></View></View><PrimaryButton onPress={onView}>View ticket details</PrimaryButton><SecondaryButton onPress={onDone}>Back to Home</SecondaryButton></ScrollView></Shell>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: 18, padding: 20, paddingBottom: 36, paddingTop: 22 }, progressWrap: { gap: 7 }, progressTop: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "space-between" }, progressText: { color: colors.primary, fontSize: 11, fontWeight: fontWeights.bold, textTransform: "uppercase" }, progressLabel: { color: colors.muted, flexShrink: 1, fontSize: 11, fontWeight: fontWeights.semibold }, progressTrack: { backgroundColor: colors.border, borderRadius: 4, height: 5, overflow: "hidden" }, progressFill: { backgroundColor: colors.primary, borderRadius: 4, height: 5 },
  search: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 8, paddingHorizontal: 14 }, searchInput: { color: colors.ink, flex: 1, fontSize: 15, minHeight: 50 }, error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  photoTile: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.card, borderStyle: "dashed", borderWidth: 2, justifyContent: "center", overflow: "hidden" }, primaryPhoto: { aspectRatio: 4 / 3, maxHeight: 285, width: "100%" }, photo: { height: "100%", width: "100%" }, photoPrompt: { alignItems: "center", gap: 9, padding: 24 }, cameraCircle: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 28, height: 56, justifyContent: "center", width: 56 }, photoTitle: { color: colors.ink, fontSize: 17, fontWeight: fontWeights.semibold, textAlign: "center" }, photoHint: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center" }, photoOverlay: { backgroundColor: colors.overlay, borderRadius: 10, bottom: 12, left: 12, paddingHorizontal: 10, paddingVertical: 6, position: "absolute" }, photoOverlayText: { color: colors.surface, fontSize: 11, fontWeight: fontWeights.semibold }, photoActions: { flexDirection: "row", gap: 10 }, photoActionsNarrow: { flexDirection: "column" }, thumbnailRow: { flexDirection: "row", flexWrap: "wrap", gap: 9 }, thumbnail: { borderRadius: 12, height: 70, overflow: "hidden", width: 70 }, removePhoto: { alignItems: "center", backgroundColor: colors.overlay, borderRadius: 11, height: 22, justifyContent: "center", position: "absolute", right: 3, top: 3, width: 22 }, addTile: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 12, height: 70, justifyContent: "center", width: 70 }, helper: { alignItems: "center", color: colors.muted, fontSize: 11, textAlign: "center" },
  detectContent: { justifyContent: "flex-start" }, locationVisual: { alignItems: "center", minHeight: 190, justifyContent: "center" }, locationPulse: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 47, height: 94, justifyContent: "center", width: 94, zIndex: 2 }, locationRing: { borderColor: colors.primarySoft, borderRadius: 82, borderWidth: 18, height: 164, position: "absolute", width: 164 }, detectStatus: { alignItems: "center", gap: 12 }, body: { color: colors.muted, fontSize: 14, lineHeight: 21 }, errorCard: { alignItems: "center", gap: 12 }, errorTitle: { color: colors.ink, fontSize: 17, fontWeight: fontWeights.bold },
  mapWrap: { aspectRatio: 4 / 3, borderRadius: radii.card, maxHeight: 290, overflow: "hidden", width: "100%" }, map: { height: "100%", width: "100%" }, mapFallback: { alignItems: "center", backgroundColor: colors.surfaceAlt, flex: 1, gap: 8, justifyContent: "center", padding: 20 }, fallbackAddress: { color: colors.ink, fontSize: 13, lineHeight: 19, textAlign: "center" }, mapMarker: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.primary, borderRadius: 15, borderWidth: 3, height: 30, justifyContent: "center", width: 30 }, mapMarkerCore: { backgroundColor: colors.primary, borderRadius: 6, height: 12, width: 12 }, mapStatus: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 15, flexDirection: "row", gap: 5, left: 12, paddingHorizontal: 10, paddingVertical: 7, position: "absolute", top: 12 }, mapStatusText: { color: colors.successText, fontSize: 11, fontWeight: fontWeights.semibold }, inputLabel: { color: colors.ink, fontSize: 12, fontWeight: fontWeights.semibold }, input: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: 13, borderWidth: 1, color: colors.ink, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12 }, addressInput: { minHeight: 74, textAlignVertical: "top" }, coordinates: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }, coordinateText: { color: colors.muted, fontSize: 11 }, retryText: { color: colors.primary, fontSize: 12, fontWeight: fontWeights.semibold }, notice: { backgroundColor: colors.warningBg, borderRadius: 14, color: colors.warningText, fontSize: 13, lineHeight: 19, padding: 13 },
  reviewCard: { gap: 14, padding: 0, overflow: "hidden" }, reviewPhoto: { aspectRatio: 16 / 9, maxHeight: 210, width: "100%" }, reviewSection: { gap: 5, paddingHorizontal: 17 }, reviewLabel: { color: colors.muted, fontSize: 10, fontWeight: fontWeights.bold, letterSpacing: 0.8 }, reviewValue: { color: colors.ink, fontSize: 16, fontWeight: fontWeights.semibold, lineHeight: 22 }, reviewDivider: { backgroundColor: colors.border, height: 1, marginHorizontal: 17 }, reviewLocation: { alignItems: "flex-start", flexDirection: "row", gap: 9, paddingBottom: 17, paddingHorizontal: 17 }, reviewCopy: { flex: 1, gap: 4 }, submitNotice: { alignItems: "flex-start", backgroundColor: colors.primarySoft, borderRadius: 15, flexDirection: "row", gap: 10, padding: 14 }, submitNoticeText: { color: colors.successText, flex: 1, fontSize: 13, lineHeight: 19 },
  centered: { justifyContent: "center", minHeight: "100%" }, feedbackIcon: { alignItems: "center", alignSelf: "center", backgroundColor: colors.warningBg, borderRadius: 40, height: 80, justifyContent: "center", width: 80 }, centerHint: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: "center" }, confirmation: { alignItems: "stretch" }, success: { alignItems: "center", alignSelf: "center", backgroundColor: colors.primary, borderRadius: 40, height: 80, justifyContent: "center", width: 80 }, successKicker: { color: colors.primary, fontSize: 11, fontWeight: fontWeights.bold, letterSpacing: 1.1, textAlign: "center" }, confirmTitle: { color: colors.ink, fontSize: 25, fontWeight: fontWeights.bold, textAlign: "center" }, centerBody: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center" }, confirmCard: { overflow: "hidden", padding: 0, paddingBottom: 16 }, confirmPhoto: { aspectRatio: 16 / 9, maxHeight: 150, width: "100%" }, ticketRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between", paddingHorizontal: 17, paddingTop: 14 }, ticketNumber: { color: colors.ink, fontSize: 18, fontWeight: fontWeights.bold, marginTop: 3 }, nextStep: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 18, flexDirection: "row", gap: 12, overflow: "hidden", padding: 16 }, nextStepLine: { backgroundColor: colors.primary, height: "100%", left: 0, position: "absolute", width: 4 }, nextStepDot: { alignItems: "center", backgroundColor: colors.primary, borderRadius: 20, height: 40, justifyContent: "center", width: 40 }, nextStepTitle: { color: colors.ink, fontSize: 15, fontWeight: fontWeights.semibold },
});
