import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { type CurrentAuth, requestCitizenOtp, verifyCitizenOtp } from "./api";
import { AppIcon, Card, PrimaryButton, ScreenHeader, SecondaryButton } from "./components";
import { Shell } from "./screen-shell";
import { colors, fontWeights } from "./theme";

const demoOtp = process.env.EXPO_PUBLIC_DEMO_OTP === "true";

export function normalizeCitizenPhone(value: string): string {
  const cleaned = value.replace(/[\s()-]/g, "").trim();
  if (cleaned.startsWith("+")) return cleaned;
  const digits = cleaned.replace(/\D/g, "");
  return digits.length === 10 ? `+91${digits}` : `+${digits}`;
}

export function PhoneLoginScreen({
  onBack,
  onSignedIn,
}: {
  onBack: () => void;
  onSignedIn: (auth: CurrentAuth) => void;
}) {
  const [phone, setPhone] = useState("");
  const [confirmedPhone, setConfirmedPhone] = useState<string>();
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const validPhone = /^\+[1-9]\d{7,14}$/.test(normalizeCitizenPhone(phone));
  const otpLength = demoOtp ? 4 : 6;

  const requestOtp = async () => {
    if (!validPhone || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const number = normalizeCitizenPhone(phone);
      await requestCitizenOtp(number);
      setConfirmedPhone(number);
      setOtp("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to request OTP");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (!confirmedPhone || otp.length !== otpLength || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const auth = await verifyCitizenOtp(confirmedPhone, otp);
      onSignedIn(auth);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not verify your code");
    } finally {
      setBusy(false);
    }
  };

  return <Shell><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <ScreenHeader eyebrow="CITIZEN ACCOUNT" title={confirmedPhone ? "Verify your phone" : "Phone login"} subtitle={confirmedPhone ? `Confirm the code for ${confirmedPhone}` : "Keep your civic reports linked to one phone number."} onBack={onBack} />
    <Card style={styles.card}>
      <View style={styles.icon}><AppIcon color={colors.primary} name="phone-portrait-outline" size={28} /></View>
      {!confirmedPhone ? <>
        <Text style={styles.label}>Mobile number</Text>
        <TextInput accessibilityLabel="Phone number with country code" autoComplete="tel" keyboardType="phone-pad" maxLength={17} onChangeText={setPhone} placeholder="+91 98765 43210" placeholderTextColor={colors.muted} style={styles.input} value={phone} />
        <Text style={styles.hint}>Enter a 10-digit Indian mobile number or a full international number with + country code.</Text>
        <PrimaryButton disabled={!validPhone || busy} onPress={() => void requestOtp()}>{busy ? "Requesting…" : "Request OTP"}</PrimaryButton>
      </> : <>
        <Text style={styles.label}>{demoOtp ? "Demo verification code" : "Verification code"}</Text>
        <TextInput accessibilityLabel="OTP verification code" autoComplete="one-time-code" keyboardType="number-pad" maxLength={otpLength} onChangeText={(next) => setOtp(next.replace(/\D/g, ""))} placeholder={demoOtp ? "1234" : "Enter 6-digit OTP"} placeholderTextColor={colors.muted} style={[styles.input, styles.otp]} value={otp} />
        {demoOtp ? <View style={styles.demoNotice}><AppIcon color={colors.primary} name="information-circle-outline" size={19} /><Text style={styles.demoText}>Demo only: use 1234. No SMS is sent; do not use this for real accounts.</Text></View> : <Text style={styles.hint}>Enter the code sent to your phone.</Text>}
        <PrimaryButton disabled={otp.length !== otpLength || busy} onPress={() => void verifyOtp()}>{busy ? "Verifying…" : "Verify and continue"}</PrimaryButton>
        <SecondaryButton disabled={busy} onPress={() => { setConfirmedPhone(undefined); setOtp(""); setError(undefined); }}>Change number</SecondaryButton>
        <SecondaryButton disabled={busy} onPress={() => void requestOtp()}>Request another code</SecondaryButton>
      </>}
      {busy ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </Card>
    <Text style={styles.footer}>Citizen guest mode remains available from the main app. Phone sign-in keeps your reports associated with your chosen number.</Text>
  </ScrollView></Shell>;
}

const styles = StyleSheet.create({
  content: { gap: 20, padding: 20, paddingBottom: 40 },
  card: { gap: 14, padding: 22 },
  icon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 24, height: 48, justifyContent: "center", width: 48 },
  label: { color: colors.ink, fontSize: 14, fontWeight: fontWeights.semibold },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, color: colors.ink, fontSize: 17, minHeight: 52, paddingHorizontal: 15 },
  otp: { fontSize: 26, letterSpacing: 8, textAlign: "center" },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  demoNotice: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: 12, flexDirection: "row", gap: 9, padding: 12 },
  demoText: { color: colors.ink, flex: 1, fontSize: 12, lineHeight: 18 },
  footer: { color: colors.muted, fontSize: 12, lineHeight: 20, textAlign: "center" },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
});
