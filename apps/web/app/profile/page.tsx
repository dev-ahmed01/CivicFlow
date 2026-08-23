"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CitizenHeader } from "../_components/citizen-header";
import { Card, PrimaryButton } from "../_components/ui";
import { clearCitizenAccessToken, getCitizenAccessToken } from "../_lib/citizen-auth";

export default function CitizenProfilePage() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(Boolean(getCitizenAccessToken())), []);
  return <main><CitizenHeader /><section className="citizen-page"><header className="citizen-page-heading"><p className="eyebrow">Account</p><h1>Citizen profile</h1><p>Manage your verified session and understand how your information is used.</p></header><Card><h2>{signedIn ? "Phone verified" : "Sign in to continue"}</h2><p>{signedIn ? "Your reports and verification activity are connected to this verified session." : "A verified phone number is required before reporting or reviewing nearby work."}</p>{signedIn ? <button className="secondary" onClick={() => { clearCitizenAccessToken(); router.push("/"); }} type="button">Sign out</button> : <PrimaryButton onClick={() => router.push("/login")} type="button">Sign in with phone</PrimaryButton>}</Card></section></main>;
}
