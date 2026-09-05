"use client";

import { useEffect, useState } from "react";
import { EngineerHeader, EngineerTip } from "../_components/engineer-ui";
import { getSession } from "../_lib/api";

export default function EngineerProfilePage() {
  const [user, setUser] = useState<NonNullable<ReturnType<typeof getSession>>["user"]>();
  useEffect(() => setUser(getSession()?.user), []);
  return <div className="engineer-profile">
    <EngineerHeader eyebrow="Account" title="Profile" description="Your City Connect account and assigned agency information." />
    <section className="engineer-account-section"><h2>Account details</h2><dl><div><dt>Work email</dt><dd>{user?.email ?? "Loading account..."}</dd></div><div><dt>Role</dt><dd>Executive Engineer</dd></div></dl></section>
    <section className="engineer-account-section"><h2>Agency assignment</h2><dl><div><dt>Agency identifier</dt><dd>{user?.agencyId ?? "Loading assignment..."}</dd></div><div><dt>Work access</dt><dd>Your assigned inspections, civic work, and dependency tasks</dd></div></dl></section>
    <section className="engineer-account-section"><h2>Security</h2><p>Your account is provisioned by your agency. Contact your Project Head if your assignment or account access needs to change.</p></section>
    <EngineerTip>Nearby activity is visible for coordination. Only work assigned to you can be updated.</EngineerTip>
  </div>;
}
