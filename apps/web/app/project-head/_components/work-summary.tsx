export function WorkSummary({ reference, title, location }: { reference: string; title: string; location: string }) {
  return <span className="ph-work-summary"><code>{reference}</code><strong title={title}>{title}</strong><small title={location}>{location}</small></span>;
}
