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
  return <main className="citizen-shell"><CitizenHeader /><section className="citizen-page"><header className="citizen-page-heading"><p className="eyebrow">Account</p><h1>Citizen profile</h1><p>Manage your CityConnect session and understand how your information is used.</p></header><Card><h2>{signedIn ? "Signed in" : "Sign in to continue"}</h2><p>{signedIn ? "Your reports and verification activity are connected to this citizen account." : "A citizen User ID is required before reporting or reviewing nearby work."}</p>{signedIn ? <button className="secondary" onClick={() => { clearCitizenAccessToken(); router.push("/login"); }} type="button">Sign out</button> : <PrimaryButton onClick={() => router.push("/login")} type="button">Sign in</PrimaryButton>}</Card></section></main>;
}
