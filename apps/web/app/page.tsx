import Link from "next/link";
import { roleGatewayOptions } from "./_lib/role-gateway";

export default function HomePage() {
  return (
    <main className="gateway-shell">
      <section className="gateway-hero">
        <Link className="gateway-brand" href="/" aria-label="CivicOS home"><span>C</span>CivicOS</Link>
        <p className="eyebrow">One city. One accountable workflow.</p>
        <h1>Choose your CivicOS workspace.</h1>
        <p>Start from the role you use to report, coordinate, deliver, or administer civic work.</p>
      </section>
      <section className="gateway-grid" aria-label="Choose your role">
        {roleGatewayOptions.map((option) => (
          <Link className="gateway-card" href={option.href} key={option.role}>
            <span className="gateway-card-mark" aria-hidden="true">{option.role.charAt(0)}</span>
            <span className="eyebrow">{option.eyebrow}</span>
            <strong>{option.role}</strong>
            <span>{option.description}</span>
            <span className="gateway-card-action">Continue <span aria-hidden="true">→</span></span>
          </Link>
        ))}
      </section>
      <p className="gateway-public-link"><Link href="/transparency">View the public city transparency dashboard</Link></p>
    </main>
  );
}
