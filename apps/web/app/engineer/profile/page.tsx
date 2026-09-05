"use client";

import { EngineerTip, EngineerSymbol } from "../_components/engineer-ui";
import { Card } from "../../_components/ui";
import { getSession } from "../_lib/api";
import { useEffect, useState } from "react";

export default function EngineerProfilePage() {
  const [user, setUser] = useState<NonNullable<ReturnType<typeof getSession>>["user"]>();
  useEffect(() => setUser(getSession()?.user), []);
  return <><header className="portal-heading"><div><p className="eyebrow">Account</p><h1>Engineer profile</h1><p>Your account is provisioned for your agency and assigned field work.</p></div></header><Card className="engineer-profile-card"><div className="engineer-profile-identity"><span className="engineer-symbol green"><EngineerSymbol name="people" /></span><div><h2>Executive Engineer</h2><p>{user?.email ?? "Loading account..."}</p></div><span className="engineer-profile-badge">Agency account</span></div><dl className="detail-list"><div><dt>Email</dt><dd>{user?.email ?? "Unavailable"}</dd></div><div><dt>Role</dt><dd>Executive Engineer</dd></div><div><dt>Agency scope</dt><dd>{user?.agencyId ?? "Unavailable"}</dd></div></dl></Card><EngineerTip>Your agency and assigned work determine which records you can act on.</EngineerTip></>;
}
