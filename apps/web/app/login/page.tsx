"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CitizenHeader } from "../_components/citizen-header";
import { PrimaryButton } from "../_components/ui";
import { saveCitizenAccessToken } from "../_lib/citizen-auth";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function CitizenLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("+919876543210");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async () => {
    setBusy(true); setError(undefined);
    try {
      const path = step === "phone" ? "/auth/citizen/request-otp" : "/auth/citizen/verify-otp";
      const response = await fetch(`${apiUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(step === "phone" ? { phone } : { phone, code }) });
      const body = await response.json() as { accessToken?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not sign in");
      if (step === "phone") setStep("code");
      else if (body.accessToken) { saveCitizenAccessToken(body.accessToken); router.push("/tickets"); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not sign in"); }
    finally { setBusy(false); }
  };
  return <main><CitizenHeader /><section className="citizen-page"><div className="login-panel citizen-login-panel"><p className="eyebrow">{step === "phone" ? "Citizen sign in" : "Verify phone"}</p><h1>{step === "phone" ? "Your city, one tap away" : "Enter the 6-digit code"}</h1><p>{step === "phone" ? "Use your verified mobile number to report issues and track progress." : `We sent a one-time code to ${phone}.`}</p><label>{step === "phone" ? "Mobile number" : "One-time code"}<input inputMode={step === "phone" ? "tel" : "numeric"} maxLength={step === "code" ? 6 : undefined} value={step === "phone" ? phone : code} onChange={(event) => step === "phone" ? setPhone(event.target.value) : setCode(event.target.value)} /></label>{error ? <p className="error" role="alert">{error}</p> : null}<PrimaryButton disabled={busy || (step === "phone" ? phone.length < 10 : code.length !== 6)} onClick={() => void submit()} type="button">{busy ? "Please wait…" : step === "phone" ? "Send verification code" : "Verify and continue"}</PrimaryButton>{step === "code" ? <button className="secondary" onClick={() => setStep("phone")} type="button">Use a different number</button> : null}</div></section></main>;
}
