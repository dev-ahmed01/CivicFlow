"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CitizenHeader } from "../_components/citizen-header";
import { CitizenHeroBackdrop, CitizenIcon } from "../_components/ui";
import { saveCitizenAccessToken } from "../_lib/citizen-auth";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const stats = [
  { icon: "clipboard" as const, value: "100+", label: "Issues Resolved" },
  { icon: "file" as const, value: "24+", label: "Departments Connected" },
  { icon: "refresh" as const, value: "Real-Time", label: "Civic Tracking" },
];

export default function CitizenLoginPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(undefined);
    try {
      const response = await fetch(`${apiUrl}/auth/citizen/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, password }) });
      const body = await response.json() as { accessToken?: string; error?: string };
      if (!response.ok || !body.accessToken) throw new Error(body.error ?? "Could not sign in");
      saveCitizenAccessToken(body.accessToken);
      router.replace("/tickets");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not sign in"); }
    finally { setBusy(false); }
  };

  return <main className="citizen-shell cf-login-page">
    <section className="cf-login-stage"><CitizenHeader variant="public" /><CitizenHeroBackdrop /><div className="cf-login-hero-copy"><h1>One City.<br />One Workflow.<br /><strong>Complete Accountability.</strong></h1><p>CityConnect unifies citizens, engineers, project heads, and administrators into one accountable civic workflow.</p><div className="cf-login-stats">{stats.map((stat) => <article key={stat.label}><span><CitizenIcon name={stat.icon} /></span><div><strong>{stat.value}</strong><small>{stat.label}</small></div></article>)}</div></div><div className="cf-hero-curve" aria-hidden="true" /></section>
    <section className="cf-login-content"><form className="cf-login-card" onSubmit={(event) => void submit(event)}>
      <header><span><CitizenIcon name="person" size={27} /></span><div><h2>Welcome Back</h2><p>Sign in to continue your civic workflow.</p></div></header>
      <label>User ID<div className="cf-input-wrap"><CitizenIcon name="person" /><input autoComplete="username" placeholder="Enter your User ID" required value={userId} onChange={(event) => setUserId(event.target.value)} /></div></label>
      <label>Password<div className="cf-input-wrap"><CitizenIcon name="lock" /><input autoComplete="current-password" minLength={8} placeholder="Enter your Password" required type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} /><button aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((visible) => !visible)} type="button"><CitizenIcon name={showPassword ? "eyeOff" : "eye"} /></button></div></label>
      <div className="cf-login-options"><label><input checked={remember} onChange={(event) => setRemember(event.target.checked)} type="checkbox" />Remember me</label><a href="mailto:support@cityconnect.local?subject=Citizen%20password%20help">Forgot Password?</a></div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="cf-login-submit" disabled={busy || userId.trim().length < 3 || password.length < 8} type="submit">{busy ? "Logging in…" : "Log In"}<CitizenIcon name="arrow" /></button>
    </form><p className="cf-secure-line"><CitizenIcon name="shield" />Secure <span>•</span> Reliable <span>•</span> Accountable</p></section>
  </main>;
}
