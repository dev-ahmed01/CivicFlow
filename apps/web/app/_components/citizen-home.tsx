"use client";

import { useRef, useState } from "react";
import { CitizenHeader } from "./citizen-header";
import { CitizenHeroBackdrop, CitizenIcon } from "./ui";
import { ReportForm } from "../report-form";

const heroFeatures = [
  { icon: "file" as const, title: "Track Every Report", copy: "Follow your report from submission to resolution." },
  { icon: "camera" as const, title: "Photo Evidence", copy: "Add photos to help teams understand the issue." },
  { icon: "refresh" as const, title: "Real-Time Updates", copy: "Stay informed as your report progresses." },
];

const steps = [
  { icon: "file" as const, title: "Submit a Report", copy: "Choose the issue category and add up to 3 photos." },
  { icon: "send" as const, title: "We Review It", copy: "Our team verifies the issue and assigns it to the right department." },
  { icon: "bell" as const, title: "You Get Updates", copy: "Track progress and receive real-time updates until it’s resolved." },
];

export function CitizenHome({ initialReportOpen = false }: { initialReportOpen?: boolean }) {
  const [reportOpen, setReportOpen] = useState(initialReportOpen);
  const formRef = useRef<HTMLDivElement>(null);
  const openReport = () => {
    setReportOpen(true);
    window.requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return <main className="citizen-shell cf-home-page">
    <section className="cf-dark-stage">
      <CitizenHeader />
      <div className="cf-hero">
        <CitizenHeroBackdrop />
        <div className="cf-hero-inner">
          <div className="cf-hero-copy">
            <h1>See Something Wrong?<br /><strong>Help Make It Right.</strong></h1>
            <p>{reportOpen ? "Spotted an issue in your neighbourhood? Report it in a few simple steps and help your city respond faster." : "Your reports help us build a cleaner, safer and better city for everyone. Report an issue in just a few simple steps."}</p>
            <div className="cf-feature-list">{heroFeatures.map((feature) => <article key={feature.title}><span><CitizenIcon name={feature.icon} /></span><div><h2>{feature.title}</h2><p>{feature.copy}</p></div></article>)}</div>
          </div>
          <aside className="cf-hero-card"><span className="cf-round-icon"><CitizenIcon name="clipboard" size={34} /></span><h2>Ready to report an issue?</h2><p>It only takes a minute.<br />Tell us what’s wrong and add a photo if you can.</p><button onClick={openReport} type="button">{reportOpen ? "Start a Report" : "Report an Issue"}<CitizenIcon name="arrow" /></button></aside>
        </div>
      </div>
      <div className="cf-hero-curve" aria-hidden="true" />
    </section>
    <div className="cf-home-content">
      {reportOpen ? <div className="cf-report-wrap" ref={formRef}><ReportForm /></div> : null}
      <section className="cf-how-it-works"><header><h2>How It Works</h2><p>Three simple steps to make a difference in your city.</p></header><div className="cf-steps">{steps.map((step, index) => <article key={step.title}><span className="cf-card-number">{index + 1}</span><span className="cf-step-icon"><CitizenIcon name={step.icon} size={29} /></span><div><h3>{step.title}</h3><p>{step.copy}</p></div></article>)}</div><p className="cf-trust-note"><span><CitizenIcon name="shield" /></span>We value your time and trust. Every report you submit helps us create a more accountable and responsive city.</p></section>
    </div>
  </main>;
}
