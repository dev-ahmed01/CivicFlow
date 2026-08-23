"use client";

import { useState } from "react";
import { adminApiFetch } from "../_lib/api";

export default function AdminSecurityPage() {
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string }>();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const begin = async () => { setError(undefined); try { setSetup(await adminApiFetch("/auth/internal/totp/setup", { method: "POST" })); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not begin setup"); } };
  const enable = async () => { setError(undefined); try { await adminApiFetch("/auth/internal/totp/enable", { method: "POST", body: JSON.stringify({ code }) }); setMessage("Two-factor authentication is enabled. Future admin logins require an authenticator code."); setSetup(undefined); setCode(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not verify code"); } };
  return <><header className="portal-heading"><div><p className="eyebrow">Account security</p><h1>Authenticator 2FA</h1><p>Add an optional time-based one-time password to your admin login.</p></div></header>{error ? <p className="error" role="alert">{error}</p> : null}{message ? <p className="success" role="status">{message}</p> : null}<section className="portal-panel security-card"><h2>Set up TOTP</h2><p>Generate a secret, add the account to any standards-compatible authenticator, then verify one six-digit code.</p>{!setup ? <button type="button" onClick={() => void begin()}>Generate setup secret</button> : <><dl><div><dt>Manual secret</dt><dd><code>{setup.secret}</code></dd></div><div><dt>Authenticator URI</dt><dd><code>{setup.otpauthUrl}</code></dd></div></dl><label>Six-digit code<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} /></label><button disabled={code.length !== 6} type="button" onClick={() => void enable()}>Verify and enable</button></>}</section></>;
}
