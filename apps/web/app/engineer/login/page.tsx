"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, saveSession, type EngineerSession } from "../_lib/api";
import { RequiredPasswordReset } from "../../_components/required-password-reset";

type LoginResponse = { user: { id: string; role: string; email: string; agencyId: string | null }; accessToken: string; refreshToken: string; requiresPasswordReset: boolean };

export default function EngineerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(undefined);
    try {
      const result = await apiFetch<LoginResponse>("/auth/internal/login", { method: "POST", body: JSON.stringify({ email, password, expectedRole: "ENGINEER" }) });
      if (result.user.role !== "ENGINEER" || !result.user.agencyId) throw new Error("This workspace is available to Executive Engineers only");
      if (result.requiresPasswordReset) { setResetToken(result.accessToken); return; }
      saveSession({ accessToken: result.accessToken, refreshToken: result.refreshToken, user: { id: result.user.id, email: result.user.email, agencyId: result.user.agencyId } } satisfies EngineerSession);
      router.replace("/engineer");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not sign in"); }
    finally { setBusy(false); }
  };
  return <main className="login-shell"><section className="login-panel"><div className="login-mark"><span>C</span>CivicOS</div><p className="eyebrow">Engineer field operations</p><h1>Welcome back.</h1><p className="login-copy">Your role and agency scope are detected after sign-in.</p>{message ? <p className="success" role="status">{message}</p> : null}{resetToken ? <RequiredPasswordReset accessToken={resetToken} currentPassword={password} onCancel={() => setResetToken(undefined)} onComplete={() => { setResetToken(undefined); setPassword(""); setMessage("Password updated. Sign in with your new password."); }} /> : <form onSubmit={(event) => void submit(event)}><label>Work email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error ? <p className="error" role="alert">{error}</p> : null}<button disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button></form>}<Link className="all-roles-link" href="/login">Sign in with a different role</Link></section><section className="login-context" aria-label="Product context"><p className="eyebrow">Accountable field delivery</p><h2>From assigned work to citizen-verified completion.</h2><div><strong>Owned edits</strong><span>Only the assigned Engineer can update a project.</span></div><div><strong>Area awareness</strong><span>Other projects remain visible and read-only for coordination.</span></div></section></main>;
}
