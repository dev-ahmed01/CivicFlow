export const roleGatewayOptions = [
  { role: "Citizen", href: "/login", eyebrow: "Report and track", description: "Report a civic issue, follow progress, and verify work in your neighbourhood." },
  { role: "Project Head", href: "/project-head/login", eyebrow: "Agency operations", description: "Review routed tickets, coordinate projects, and manage dependencies." },
  { role: "Engineer", href: "/engineer/login", eyebrow: "Field delivery", description: "Open assigned work, add field updates, and submit completion evidence." },
  { role: "Administrator", href: "/admin/login", eyebrow: "City administration", description: "Manage civic configuration, routing, users, and city-wide analytics." },
] as const;
