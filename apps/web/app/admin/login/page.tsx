"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { adminApiFetch, ApiError, saveAdminSession, type AdminSession } from "../_lib/api";

type LoginResponse = { user: { id: string; role: string; email: string }; accessToken: string; refreshToken: string; requiresPasswordReset: boolean };

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@civicos.local");
  const [password, setPassword] = useState("CivicOS@123");
  const [totpCode, setTotpCode] = useState("");
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(undefined);
    try {
      const result = await adminApiFetch<LoginResponse>("/auth/internal/login", { method: "POST", body: JSON.stringify({ email, password, expectedRole: "ADMIN", ...(totpCode ? { totpCode } : {}) }) });
      if (result.user.role !== "ADMIN") throw new Error("This workspace is available to city administrators only");
      if (result.requiresPasswordReset) throw new Error("Reset this account’s temporary password before opening the workspace");
      saveAdminSession({ accessToken: result.accessToken, refreshToken: result.refreshToken, user: { id: result.user.id, email: result.user.email } } satisfies AdminSession);
      router.replace("/admin");
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "TOTP_REQUIRED") { setRequiresTotp(true); setError("Enter the current code from your authenticator app."); }
      else setError(reason instanceof Error ? reason.message : "Could not sign in");
    } finally { setBusy(false); }
  };
  return <main className="login-shell admin-login">
    <section className="login-panel"><div className="login-mark"><span>C</span>CivicOS</div><p className="eyebrow">City administration</p><h1>Control room.</h1><p className="login-copy">Manage live civic configuration and city-wide reporting.</p>
      <form onSubmit={(event) => void submit(event)}>
        <label>Admin email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {requiresTotp ? <label>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ""))} /></label> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}<button disabled={busy} type="submit">{busy ? "Verifying…" : "Sign in"}</button>
      </form><p className="demo-note">Demo: admin@civicos.local / CivicOS@123</p>
    </section>
    <section className="login-context"><p className="eyebrow">Configuration without deployment</p><h2>Measure outcomes. Tune the system.</h2><div><strong>Live routing</strong><span>Category changes apply to the next validated ticket.</span></div><div><strong>Privacy first</strong><span>The public view contains aggregates only.</span></div></section>
  </main>;
}
