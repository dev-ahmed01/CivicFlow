"use client";

import { Card } from "../../_components/ui";
import { getSession } from "../_lib/api";
import { useEffect, useState } from "react";

export default function ProjectHeadProfilePage() {
  const [user, setUser] = useState<NonNullable<ReturnType<typeof getSession>>["user"]>();
  useEffect(() => setUser(getSession()?.user), []);
  return <><header className="portal-heading"><div><p className="eyebrow">Account</p><h1>Project Head profile</h1><p>Your role and agency scope are assigned by a city administrator.</p></div></header><Card><dl className="detail-list"><div><dt>Email</dt><dd>{user?.email ?? "Unavailable"}</dd></div><div><dt>Role</dt><dd>Project Head</dd></div><div><dt>Agency scope</dt><dd>{user?.agencyId ?? "Unavailable"}</dd></div></dl></Card></>;
}
