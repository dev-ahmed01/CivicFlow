import type { ProjectHeadTicketSummary, ProjectListItem } from "@civicos/shared";

type SummaryLocation = Partial<Pick<ProjectListItem, "locationLabel" | "ticket" | "title">> & Partial<Pick<ProjectHeadTicketSummary, "ward">>;

/** Compact presentation only; full addresses and descriptions stay in the record. */
export function getShortWorkLocation(work: SummaryLocation): string {
  const ward = work.ward?.name ?? work.ticket?.ward.name;
  let label = work.locationLabel?.trim();
  if (!label) return ward ?? "Location not recorded";
  // Old demo records stored a title in locationLabel. Use its explicit "near"
  // place, when present, otherwise the recorded ward rather than a description.
  if (work.title && label.startsWith(work.title)) {
    const place = work.title.match(/\bnear\s+(.+)$/i)?.[1];
    if (!place) return ward ?? "Location not recorded";
    label = place;
  }
  const parts = label.split(/[,·]/).map((part) => part.trim()).filter(Boolean);
  const postalIndex = parts.findIndex((part) => /^(Bengaluru|Bangalore|Karnataka|India)\b/i.test(part));
  const localParts = parts.slice(0, postalIndex < 0 ? undefined : postalIndex);
  const roadIndex = localParts.findIndex((part) => /\b(road|street|main|cross|lane)\b/i.test(part));
  if (roadIndex >= 0) return [...new Set([localParts[roadIndex], localParts[roadIndex + 1] ?? ward].filter(Boolean))].join(", ");
  return localParts[0] ?? ward ?? "Location not recorded";
}
