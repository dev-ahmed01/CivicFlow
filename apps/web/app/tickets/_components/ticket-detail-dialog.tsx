"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { CitizenTicketNote, CitizenTicketSummary, CitizenTicketTimelineItem } from "@civicos/shared";
import { StatusChip } from "../../_components/ui";

function exactDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  }).replace("am", "AM").replace("pm", "PM");
}

export function TicketDetailDialog({ ticket, timeline, notes, loading, error, onClose }: {
  ticket: CitizenTicketSummary;
  timeline?: CitizenTicketTimelineItem[];
  notes?: CitizenTicketNote[];
  loading: boolean;
  error?: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  return (
    <dialog
      aria-busy={loading}
      aria-labelledby="ticket-dialog-title"
      className="cf-ticket-dialog"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      ref={dialogRef}
    >
      <article className="cf-ticket-dialog-card">
        <button aria-label="Close ticket details" className="cf-dialog-close" onClick={onClose} type="button">×</button>
        <header className="cf-dialog-header">
          <div><p className="eyebrow">{ticket.category.name}</p><h2 id="ticket-dialog-title">{ticket.title}</h2><code>Ticket CC-{ticket.id.slice(0, 4).toUpperCase()}</code></div>
          <StatusChip label={ticket.statusLabel} />
        </header>

        {error ? <p className="error" role="alert">{error}</p> : null}
        {loading ? <div className="cf-dialog-loading" role="status">Loading ticket history…</div> : (
          <div className="cf-dialog-grid">
            <section aria-labelledby="ticket-history-heading" className="cf-dialog-section">
              <div className="cf-dialog-section-heading"><span>01</span><div><h3 id="ticket-history-heading">Status history</h3><p>Every completed stage, in chronological order.</p></div></div>
              {timeline?.length ? <ol className="cf-dialog-timeline">{timeline.map((event, index) => (
                <li key={`${event.status}-${new Date(event.at).toISOString()}`}><span aria-hidden="true">{index + 1}</span><div><strong>{event.label}</strong><time dateTime={new Date(event.at).toISOString()}>{exactDateTime(event.at)}</time></div></li>
              ))}</ol> : <p className="cf-dialog-empty">No status changes have been recorded yet.</p>}
            </section>

            <section aria-labelledby="ticket-notes-heading" className="cf-dialog-section">
              <div className="cf-dialog-section-heading"><span>02</span><div><h3 id="ticket-notes-heading">Additional notes</h3><p>Updates shared during inspection and delivery.</p></div></div>
              {notes?.length ? <div className="cf-dialog-notes">{notes.map((note) => (
                <article key={`${note.source}-${note.id}`}><div><strong>{note.label}</strong><time dateTime={new Date(note.at).toISOString()}>{exactDateTime(note.at)}</time></div><p>{note.text}</p></article>
              ))}</div> : <p className="cf-dialog-empty">No additional notes yet.</p>}
            </section>
          </div>
        )}

        <footer className="cf-dialog-footer"><Link href={`/tickets/${ticket.id}`}>Open full page</Link><button className="secondary" onClick={onClose} type="button">Cancel</button></footer>
      </article>
    </dialog>
  );
}
