"use client";

import { useState, type FormEvent } from "react";
import { apiRequest } from "../_lib/api";

export function RequiredPasswordReset({ accessToken, currentPassword, onComplete, onCancel }: {
  accessToken: string;
  currentPassword: string;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (nextPassword !== confirmPassword) { setError("New passwords do not match"); return; }
    setBusy(true); setError(undefined);
    try {
      await apiRequest("/auth/internal/reset-password", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ currentPassword, newPassword: nextPassword }) });
      onComplete();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not reset password"); }
    finally { setBusy(false); }
  };
  return <form onSubmit={(event) => void submit(event)}><p role="status">This account uses a temporary password. Choose a new password before continuing.</p><label>New password<input autoComplete="new-password" minLength={12} required type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} /></label><label>Confirm new password<input autoComplete="new-password" minLength={12} required type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>{error ? <p className="error" role="alert">{error}</p> : null}<button disabled={busy || nextPassword.length < 12 || confirmPassword.length < 12} type="submit">{busy ? "Updating…" : "Set new password"}</button><button className="secondary" disabled={busy} onClick={onCancel} type="button">Cancel</button></form>;
}
