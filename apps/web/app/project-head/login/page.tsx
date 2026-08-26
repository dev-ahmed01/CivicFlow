"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiFetch, saveSession, type ProjectHeadSession } from "../_lib/api";
import { RequiredPasswordReset } from "../../_components/required-password-reset";

type LoginResponse = {
  user: { id: string; role: string; email: string; agencyId: string | null };
  accessToken: string;
  refreshToken: string;
  requiresPasswordReset: boolean;
};

export default function ProjectHeadLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const result = await apiFetch<LoginResponse>("/auth/internal/login", {
        method: "POST",
        body: JSON.stringify({ email, password, expectedRole: "PROJECT_HEAD" }),
      });
      if (result.user.role !== "PROJECT_HEAD" || !result.user.agencyId) {
        throw new Error("This workspace is available to agency Project Heads only");
      }
      if (result.requiresPasswordReset) {
        setResetToken(result.accessToken);
        return;
      }
      saveSession({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: { id: result.user.id, email: result.user.email, agencyId: result.user.agencyId },
      } satisfies ProjectHeadSession);
      router.replace("/project-head");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-panel">
        <LinkMark />
        <p className="eyebrow">Agency operations</p>
        <h1>Welcome back.</h1>
        <p className="login-copy">Sign in to your agency-scoped Project Head workspace.</p>
        {message ? <p className="success" role="status">{message}</p> : null}
        {resetToken ? <RequiredPasswordReset accessToken={resetToken} currentPassword={password} onCancel={() => setResetToken(undefined)} onComplete={() => { setResetToken(undefined); setPassword(""); setMessage("Password updated. Sign in with your new password."); }} /> : <form onSubmit={(event) => void submit(event)}>
          <label>Work email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <button disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button>
        </form>}
        <Link className="all-roles-link" href="/login">Sign in with a different role</Link>
      </section>
      <section className="login-context" aria-label="Product context">
        <p className="eyebrow">One civic workflow</p>
        <h2>From validated report to accountable delivery.</h2>
        <div><strong>Agency scoped</strong><span>Every queue, action, and project is checked on the server.</span></div>
        <div><strong>DB routed</strong><span>Categories reach the agency configured by administrators.</span></div>
      </section>
    </main>
  );
}

function LinkMark() {
  return <div className="login-mark"><span>C</span>CivicOS</div>;
}
