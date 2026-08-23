"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, saveSession, type EngineerSession } from "../_lib/api";

type LoginResponse = { user: { id: string; role: string; email: string; agencyId: string | null }; accessToken: string; refreshToken: string; requiresPasswordReset: boolean };

export default function EngineerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("engineer.pwd@civicos.local");
  const [password, setPassword] = useState("CivicOS@123");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(undefined);
    try {
      const result = await apiFetch<LoginResponse>("/auth/internal/login", { method: "POST", body: JSON.stringify({ email, password }) });
      if (result.user.role !== "ENGINEER" || !result.user.agencyId) throw new Error("This workspace is available to Executive Engineers only");
      if (result.requiresPasswordReset) throw new Error("Reset this account's temporary password before continuing");
      saveSession({ accessToken: result.accessToken, refreshToken: result.refreshToken, user: { id: result.user.id, email: result.user.email, agencyId: result.user.agencyId } } satisfies EngineerSession);
      router.replace("/engineer");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not sign in"); }
    finally { setBusy(false); }
  };
  return <main className="login-shell"><section className="login-panel"><div className="login-mark"><span>C</span>CivicOS</div><p className="eyebrow">Engineer field operations</p><h1>Welcome back.</h1><p className="login-copy">Your role and agency scope are detected after sign-in.</p><form onSubmit={(event) => void submit(event)}><label>Work email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error ? <p className="error" role="alert">{error}</p> : null}<button disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button></form><p className="demo-note">Demo: engineer.pwd@civicos.local / CivicOS@123</p></section><section className="login-context" aria-label="Product context"><p className="eyebrow">Accountable field delivery</p><h2>From assigned work to citizen-verified completion.</h2><div><strong>Owned edits</strong><span>Only the assigned Engineer can update a project.</span></div><div><strong>Area awareness</strong><span>Other projects remain visible and read-only for coordination.</span></div></section></main>;
}
