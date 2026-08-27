import { useCallback, useEffect, useState } from "react";
import Constants from "expo-constants";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CurrentAuth } from "./api";
import { AppIcon, BrandLockup, Card, ScreenHeader, SecondaryButton } from "./components";
import { registerForPushNotifications } from "./push-notifications";
import { Shell } from "./screen-shell";
import { colors, fontWeights } from "./theme";

type PermissionState = "Enabled" | "Disabled" | "Checking";

export function CitizenProfileScreen({ auth, onSignOut }: { auth: CurrentAuth; onSignOut: () => void }) {
  const [locationState, setLocationState] = useState<PermissionState>("Checking");
  const [notificationState, setNotificationState] = useState<PermissionState>("Checking");
  const refresh = useCallback(async () => {
    const [location, notifications] = await Promise.all([Location.getForegroundPermissionsAsync(), Notifications.getPermissionsAsync()]);
    setLocationState(location.granted ? "Enabled" : "Disabled");
    setNotificationState(notifications.granted ? "Enabled" : "Disabled");
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const enableLocation = async () => {
    const result = await Location.requestForegroundPermissionsAsync();
    setLocationState(result.granted ? "Enabled" : "Disabled");
    if (!result.granted && !result.canAskAgain) await Linking.openSettings();
  };
  const enableNotifications = async () => {
    const result = await Notifications.requestPermissionsAsync();
    setNotificationState(result.granted ? "Enabled" : "Disabled");
    if (result.granted) await registerForPushNotifications().catch(() => false);
    if (!result.granted && !result.canAskAgain) await Linking.openSettings();
  };
  const version = Constants.expoConfig?.version ?? "1.0.0";
  return <Shell><ScrollView contentContainerStyle={styles.content}><ScreenHeader eyebrow="Account" title="Citizen Profile" subtitle="Manage your account and app permissions." /><View style={styles.identity}><View style={styles.avatar}><AppIcon color={colors.primary} name="person" size={35} /></View><BrandLockup compact /><Text style={styles.phone}>{auth.phone ?? "Verified citizen account"}</Text><View style={styles.verified}><AppIcon color={colors.successText} name="checkmark-circle" size={16} /><Text style={styles.verifiedText}>Signed in</Text></View></View><Card><Text style={styles.sectionLabel}>APP PERMISSIONS</Text><PermissionRow icon="location-outline" label="Location" state={locationState} onEnable={() => void enableLocation()} /><View style={styles.divider} /><PermissionRow icon="notifications-outline" label="Notifications" state={notificationState} onEnable={() => void enableNotifications()} /></Card><Card><View style={styles.infoRow}><View><Text style={styles.rowTitle}>App version</Text><Text style={styles.rowHint}>City Connect for Android</Text></View><Text style={styles.version}>{version}</Text></View></Card><View style={styles.privacy}><AppIcon color={colors.infoText} name="shield-checkmark-outline" size={20} /><Text style={styles.privacyText}>Your location is used to route reports and, outside demo mode, find relevant community validation requests.</Text></View><SecondaryButton icon="log-out-outline" onPress={onSignOut}>Log out</SecondaryButton></ScrollView></Shell>;
}

function PermissionRow({ icon, label, state, onEnable }: { icon: "location-outline" | "notifications-outline"; label: string; state: PermissionState; onEnable: () => void }) {
  const enabled = state === "Enabled";
  return <View style={styles.permissionRow}><View style={[styles.permissionIcon, enabled && styles.permissionIconEnabled]}><AppIcon color={enabled ? colors.successText : colors.warningText} name={icon} size={21} /></View><View style={styles.permissionCopy}><Text style={styles.rowTitle}>{label}</Text><Text style={[styles.rowHint, enabled ? styles.enabledText : styles.disabledText]}>{label}: {state}</Text></View>{state === "Disabled" ? <Pressable accessibilityRole="button" onPress={onEnable} style={styles.enableButton}><Text style={styles.enableText}>Enable</Text></Pressable> : null}</View>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: 18, padding: 20, paddingBottom: 38, paddingTop: 22 }, identity: { alignItems: "center", gap: 8, paddingVertical: 9 }, avatar: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 38, height: 76, justifyContent: "center", marginBottom: 4, width: 76 }, phone: { color: colors.ink, fontSize: 16, fontWeight: fontWeights.semibold }, verified: { alignItems: "center", flexDirection: "row", gap: 5 }, verifiedText: { color: colors.successText, fontSize: 12, fontWeight: fontWeights.semibold }, sectionLabel: { color: colors.muted, fontSize: 10, fontWeight: fontWeights.bold, letterSpacing: 0.9 }, permissionRow: { alignItems: "center", flexDirection: "row", gap: 11, minHeight: 55 }, permissionIcon: { alignItems: "center", backgroundColor: colors.warningBg, borderRadius: 20, height: 40, justifyContent: "center", width: 40 }, permissionIconEnabled: { backgroundColor: colors.successBg }, permissionCopy: { flex: 1, gap: 3 }, rowTitle: { color: colors.ink, fontSize: 14, fontWeight: fontWeights.semibold }, rowHint: { color: colors.muted, fontSize: 11 }, enabledText: { color: colors.successText }, disabledText: { color: colors.warningText }, enableButton: { backgroundColor: colors.primarySoft, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 8 }, enableText: { color: colors.primary, fontSize: 12, fontWeight: fontWeights.bold }, divider: { backgroundColor: colors.border, height: 1 }, infoRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" }, version: { color: colors.primary, fontSize: 14, fontWeight: fontWeights.bold }, privacy: { alignItems: "flex-start", backgroundColor: colors.infoBg, borderRadius: 15, flexDirection: "row", gap: 9, padding: 14 }, privacyText: { color: colors.infoText, flex: 1, fontSize: 11, lineHeight: 17 },
});
