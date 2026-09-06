import { StatusChip, type SemanticTone } from "../../_components/ui";
import { WorkSummary } from "./work-summary";

export function AttentionCard({ reference, title, location, state, tone, actionLabel, onOpen }: {
  reference: string; title: string; location: string; state: string;
  tone: SemanticTone; actionLabel: string; onOpen: () => void;
}) {
  return <article className="ph-attention-card">
    <button className="ph-attention-identity" aria-label={`Open ${reference} ${title}`} onClick={onOpen} type="button"><WorkSummary reference={reference} title={title} location={location} /></button>
    <StatusChip label={state} tone={tone} />
    <button className="ph-attention-action" onClick={onOpen} type="button">{actionLabel}<span aria-hidden="true">→</span></button>
  </article>;
}
