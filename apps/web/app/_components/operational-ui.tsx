"use client";

import type { CivicWorkGeometry, EngineerCapacitySummary } from "@civicos/shared";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StatusChip, type SemanticTone } from "./ui";

export type EvidenceKind = "Reported" | "Inspection" | "Progress" | "Blocker" | "Completion" | "Verification";

export type EvidenceItem = {
  id: string;
  url: string;
  kind: EvidenceKind;
  caption?: string | null;
  timestamp?: string | Date | null;
  uploadedBy?: string | null;
  role?: string | null;
  contentType?: string | null;
};

export function DetailDrawer({ open, title, reference, status, statusTone, onClose, children, footer }: {
  open: boolean;
  title: string;
  reference: string;
  status?: string;
  statusTone?: SemanticTone;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return <dialog aria-labelledby="operational-drawer-title" className="operational-drawer" onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose} ref={ref}>
    <div className="operational-drawer-shell">
      <header className="operational-drawer-header">
        <div><code>{reference}</code><h2 id="operational-drawer-title">{title}</h2>{status ? <StatusChip label={status} tone={statusTone} /> : null}</div>
        <button aria-label="Close details" className="operational-drawer-close" onClick={onClose} type="button">×</button>
      </header>
      <div className="operational-drawer-content">{children}</div>
      {footer ? <footer className="operational-drawer-footer">{footer}</footer> : null}
    </div>
  </dialog>;
}

export function DrawerSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="drawer-section"><header><h3>{title}</h3>{description ? <p>{description}</p> : null}</header>{children}</section>;
}

export function StatusSummary({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return <dl className="status-summary">{items.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
}

export function ActionCard({ reference, title, origin, location, age, owner, evidenceCount, state, tone = "info", actionLabel, onOpen, onAction }: {
  reference: string;
  title: string;
  origin: string;
  location: string;
  age?: string;
  owner?: string;
  evidenceCount?: number;
  state: string;
  tone?: SemanticTone;
  actionLabel: string;
  onOpen: () => void;
  onAction?: () => void;
}) {
  return <article className="operational-action-card">
    <button aria-label={`Open ${reference} ${title}`} className="operational-card-open" onClick={onOpen} type="button">
      <span><code>{reference}</code><strong>{title}</strong><small>{location}</small></span>
      <span className="operational-card-context"><small>{origin}{age ? ` · ${age}` : ""}</small>{owner ? <small>Responsible: {owner}</small> : null}{typeof evidenceCount === "number" ? <small>Evidence: {evidenceCount} photo{evidenceCount === 1 ? "" : "s"}</small> : null}</span>
      <StatusChip label={state} tone={tone} />
    </button>
    <button className="operational-card-action" onClick={onAction ?? onOpen} type="button">{actionLabel}<span aria-hidden="true">→</span></button>
  </article>;
}

function EvidenceThumbnail({ item, priority = false }: { item: EvidenceItem; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  const isImage = !item.contentType || item.contentType.startsWith("image/");
  return <figure className="evidence-thumbnail">
    <a aria-label={`Open ${item.kind} evidence${item.caption ? `: ${item.caption}` : ""}`} href={item.url} rel="noreferrer" target="_blank">
      {!failed && isImage ? <Image alt={`${item.kind} civic work evidence${item.caption ? ` — ${item.caption}` : ""}`} fill onError={() => setFailed(true)} priority={priority} sizes="(max-width: 640px) 44vw, 220px" src={item.url} unoptimized /> : <span className="evidence-fallback">{isImage ? "Image unavailable" : "Open document"}</span>}
    </a>
    <figcaption><strong>{item.kind}</strong>{item.caption ? <span>{item.caption}</span> : null}{item.timestamp ? <time>{new Date(item.timestamp).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time> : null}{item.uploadedBy ? <small>{item.uploadedBy}{item.role ? ` · ${item.role}` : ""}</small> : null}</figcaption>
  </figure>;
}

export function EvidenceGallery({ items, emptyMessage = "No evidence has been recorded for this stage." }: { items: EvidenceItem[]; emptyMessage?: string }) {
  if (!items.length) return <p className="evidence-empty">{emptyMessage}</p>;
  return <div className="evidence-gallery">{items.map((item, index) => <EvidenceThumbnail item={item} key={item.id} priority={index === 0} />)}</div>;
}

export function BeforeAfterEvidence({ before, after }: { before: EvidenceItem[]; after: EvidenceItem[] }) {
  const comparable = before.length > 0 && after.length > 0;
  if (!comparable) return <div className="evidence-sequence"><div><h4>Before</h4><EvidenceGallery items={before} emptyMessage="No reported or inspection image is available." /></div><div><h4>After</h4><EvidenceGallery items={after} emptyMessage="No completion image has been submitted." /></div></div>;
  return <div className="before-after-evidence"><div><h4>Before</h4><EvidenceThumbnail item={before[0]!} priority /></div><div><h4>After</h4><EvidenceThumbnail item={after[0]!} priority /></div>{before.length + after.length > 2 ? <details><summary>View all evidence ({before.length + after.length})</summary><div className="evidence-sequence"><EvidenceGallery items={before} /><EvidenceGallery items={after} /></div></details> : null}</div>;
}

type PreviewFeature = { geometry: CivicWorkGeometry; label?: string; tone?: "primary" | "conflict" };
type Point = [number, number];

function points(geometry: CivicWorkGeometry): Point[] {
  if (geometry.type === "Point") return [geometry.coordinates];
  if (geometry.type === "LineString") return geometry.coordinates;
  return geometry.coordinates.flat();
}

export function LocationPreview({ label, ward, features = [] }: { label: string; ward?: string | null; features?: PreviewFeature[] }) {
  const shapes = useMemo(() => {
    const all = features.flatMap(({ geometry }) => points(geometry));
    if (!all.length) return [];
    const longitudes = all.map(([longitude]) => longitude);
    const latitudes = all.map(([, latitude]) => latitude);
    const minX = Math.min(...longitudes); const maxX = Math.max(...longitudes);
    const minY = Math.min(...latitudes); const maxY = Math.max(...latitudes);
    const rangeX = maxX - minX || 0.002; const rangeY = maxY - minY || 0.002;
    const toPoint = ([longitude, latitude]: Point) => `${12 + ((longitude - minX) / rangeX) * 76},${88 - ((latitude - minY) / rangeY) * 76}`;
    return features.map((feature) => ({ ...feature, svgPoints: points(feature.geometry).map(toPoint).join(" ") }));
  }, [features]);

  return <div className="location-preview">
    <div className="location-preview-canvas" role="img" aria-label={shapes.length ? `Map preview of ${label}${features.length > 1 ? " showing overlapping work geometries" : ""}` : `Location recorded for ${label}`}>
      <span aria-hidden="true" className="location-road road-a" /><span aria-hidden="true" className="location-road road-b" />
      {shapes.length ? <svg aria-hidden="true" viewBox="0 0 100 100">{shapes.map((shape, index) => shape.geometry.type === "Point" ? <circle className={shape.tone ?? "primary"} cx={shape.svgPoints.split(",")[0]} cy={shape.svgPoints.split(",")[1]} key={index} r="4" /> : shape.geometry.type === "Polygon" ? <polygon className={shape.tone ?? "primary"} key={index} points={shape.svgPoints} /> : <polyline className={shape.tone ?? "primary"} key={index} points={shape.svgPoints} />)}</svg> : <span className="location-marker" aria-hidden="true" />}
    </div>
    <div className="location-preview-label"><span aria-hidden="true">⌖</span><span><strong>{label}</strong>{ward ? <small>{ward}</small> : null}</span></div>
    {features.length > 1 ? <div className="location-preview-legend">{features.map((feature, index) => <span data-tone={feature.tone ?? "primary"} key={`${feature.label ?? "Work"}-${index}`}>{feature.label ?? `Work ${index + 1}`}</span>)}</div> : null}
  </div>;
}

export function EngineerAssignmentCard({ engineer, selected, onSelect }: { engineer: EngineerCapacitySummary; selected: boolean; onSelect: () => void }) {
  const label = engineer.displayName ?? engineer.email ?? "Engineer";
  return <button aria-pressed={selected} className="engineer-assignment-card" onClick={onSelect} type="button">
    <span className="engineer-assignment-radio" aria-hidden="true" />
    <span className="engineer-assignment-name"><strong>{label}</strong><small>{engineer.email}</small></span>
    <span className="engineer-assignment-load"><strong>{engineer.loadLabel}</strong><small>{engineer.loadReason}</small></span>
    <span className="engineer-assignment-facts"><small>{engineer.pendingAssignments} pending assignment{engineer.pendingAssignments === 1 ? "" : "s"}</small><small>{engineer.nextDeadline ? `Next deadline ${new Date(engineer.nextDeadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "No upcoming deadline"}</small></span>
  </button>;
}

export function DrawerDeepLink({ href, children = "Open full record" }: { href: string; children?: ReactNode }) {
  return <Link className="drawer-deep-link" href={href}>{children}<span aria-hidden="true">↗</span></Link>;
}
