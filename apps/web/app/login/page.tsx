"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CitizenHeader } from "../_components/citizen-header";
import { RequiredPasswordReset } from "../_components/required-password-reset";
import { CitizenHeroBackdrop, CitizenIcon } from "../_components/ui";
import { ApiRequestError, fetchApiJson } from "../_lib/api";
import { saveCitizenSession } from "../_lib/citizen-auth";
import { saveSession as saveProjectHeadSession } from "../project-head/_lib/api";
import { saveSession as saveEngineerSession } from "../engineer/_lib/api";

const stats = [
  { icon: "clipboard" as const, value: "Trackable", label: "Issue Lifecycle" },
  { icon: "file" as const, value: "Configured", label: "Agency Routing" },
  { icon: "refresh" as const, value: "Real-Time", label: "Civic Tracking" },
];

type LoginBody = {
  accessToken?: string;
  refreshToken?: string;
  error?: string;
  code?: string;
  requiresPasswordReset?: boolean;
  user?: {
    id: string;
    role: "CITIZEN" | "PROJECT_HEAD" | "ENGINEER";
    email?: string | null;
    phone?: string | null;
    agencyId?: string | null;
  };
};

async function postLogin(path: string, credentials: Record<string, string>): Promise<{ response: Response; body: LoginBody }> {
  const result = await fetchApiJson<LoginBody>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  if (result.response.status >= 500) {
    throw new ApiRequestError("The login service returned a server error. Please try again.", result.response.status);
  }
  return result;
}

export default function CitizenLoginPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [resetToken, setResetToken] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const citizen = await postLogin("/auth/citizen/login", { userId: userId.trim(), password });
      if (citizen.response.ok && citizen.body.accessToken && citizen.body.refreshToken) {
        saveCitizenSession({ accessToken: citizen.body.accessToken, refreshToken: citizen.body.refreshToken }, remember);
        router.replace("/");
        return;
      }
      if (!userId.includes("@")) throw new Error(citizen.body.error ?? "Invalid User ID or password");

      // Internal users share this branded entry point, while the API remains authoritative for role/RBAC.
      const internal = await postLogin("/auth/internal/login", { email: userId.trim(), password });
      const { body } = internal;
      if (!internal.response.ok || !body.accessToken || !body.refreshToken || !body.user) {
        throw new Error(body.error ?? citizen.body.error ?? "Invalid User ID or password");
      }
      if (body.requiresPasswordReset) {
        setResetToken(body.accessToken);
        return;
      }

      const email = body.user.email ?? userId.trim();
      if (body.user.role === "PROJECT_HEAD" && body.user.agencyId) {
        saveProjectHeadSession({ accessToken: body.accessToken, refreshToken: body.refreshToken, user: { id: body.user.id, email, agencyId: body.user.agencyId } });
        router.replace("/project-head");
      } else if (body.user.role === "ENGINEER" && body.user.agencyId) {
        saveEngineerSession({ accessToken: body.accessToken, refreshToken: body.refreshToken, user: { id: body.user.id, email, agencyId: body.user.agencyId } });
        router.replace("/engineer");
      } else {
        throw new Error("This account is not configured for a web workspace.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  return <main className="citizen-shell cf-login-page">
    <section className="cf-login-stage">
      <CitizenHeader variant="public" />
      <CitizenHeroBackdrop />
      <div className="cf-login-hero-copy">
        <h1>One City.<br />One Workflow.<br /><strong>Complete Accountability.</strong></h1>
        <p>CityConnect unifies citizens, engineers, and project heads in one accountable civic workflow.</p>
        <div className="cf-login-stats">{stats.map((stat) => <article key={stat.label}><span><CitizenIcon name={stat.icon} /></span><div><strong>{stat.value}</strong><small>{stat.label}</small></div></article>)}</div>
      </div>
      <div className="cf-hero-curve" aria-hidden="true" />
    </section>
    <section className="cf-login-content">
      <div className="cf-login-card">
        <header><span><CitizenIcon name="person" size={27} /></span><div><h2>Welcome Back</h2><p>Sign in to continue your civic workflow.</p></div></header>
        {message ? <p className="success" role="status">{message}</p> : null}
        {resetToken ? <RequiredPasswordReset
          accessToken={resetToken}
          currentPassword={password}
          onCancel={() => setResetToken(undefined)}
          onComplete={() => {
            setResetToken(undefined);
            setPassword("");
            setMessage("Password updated. Sign in with your new password.");
          }}
        /> : <form onSubmit={(event) => void submit(event)}>
          <label>User ID<div className="cf-input-wrap"><CitizenIcon name="person" /><input autoComplete="username" placeholder="Enter your User ID" required value={userId} onChange={(event) => setUserId(event.target.value)} /></div></label>
          <label>Password<div className="cf-input-wrap"><CitizenIcon name="lock" /><input autoComplete="current-password" minLength={8} placeholder="Enter your Password" required type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} /><button aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((visible) => !visible)} type="button"><CitizenIcon name={showPassword ? "eyeOff" : "eye"} /></button></div></label>
          <div className="cf-login-options"><label><input checked={remember} onChange={(event) => setRemember(event.target.checked)} type="checkbox" />Remember me</label><a href="mailto:support@cityconnect.local?subject=Citizen%20password%20help">Forgot Password?</a></div>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <button className="cf-login-submit" disabled={busy || userId.trim().length < 3 || password.length < 8} type="submit">{busy ? "Logging in…" : "Log In"}<CitizenIcon name="arrow" /></button>
        </form>}
      </div>
      <p className="cf-secure-line"><CitizenIcon name="shield" />Secure <span>•</span> Reliable <span>•</span> Accountable</p>
      <nav className="cf-role-login-links" aria-label="Role-specific sign in"><a href="/project-head/login">Project Head</a><a href="/engineer/login">Engineer</a></nav>
    </section>
  </main>;
}
