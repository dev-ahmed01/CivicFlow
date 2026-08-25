import type { Notification, UserRole } from "./schemas";

export type NotificationTone = "info" | "success" | "warning" | "danger";
export type NotificationFilter = "all" | "dependencies" | "assignments" | "conflicts" | "completion";

export type NotificationPresentation = {
  icon: string;
  tone: NotificationTone;
  category: Exclude<NotificationFilter, "all"> | "general";
  message: string;
};

const presentations: Record<string, NotificationPresentation> = {
  VALIDATION_REQUEST: { icon: "i", tone: "info", category: "general", message: "A nearby issue needs your verification." },
  TICKET_VALIDATED: { icon: "✓", tone: "success", category: "general", message: "Community verification validated your report." },
  TICKET_ROUTED_TO_AGENCY: { icon: "✓", tone: "success", category: "general", message: "The responsible agency received your report." },
  PROJECT_ACTIVE: { icon: "▶", tone: "info", category: "assignments", message: "Work has started on this issue." },
  WORK_STARTED: { icon: "▶", tone: "info", category: "assignments", message: "Work has started on this issue." },
  PROJECT_COMPLETED: { icon: "◆", tone: "warning", category: "completion", message: "Work is complete and awaiting evidence review." },
  WORK_COMPLETED: { icon: "◆", tone: "warning", category: "completion", message: "The agency marked this work complete." },
  COMPLETION_VERIFICATION_REQUEST: { icon: "◆", tone: "warning", category: "completion", message: "Please review the completed work evidence." },
  TICKET_RESOLVED: { icon: "✓", tone: "success", category: "completion", message: "This civic issue has been resolved." },
  COMPLETION_VERIFIED: { icon: "✓", tone: "success", category: "completion", message: "Citizens verified the completed work." },
  PROJECT_REWORK_REQUESTED: { icon: "◆", tone: "warning", category: "completion", message: "Citizens requested more work before closure." },
  DEPENDENCY_REQUEST: { icon: "↔", tone: "warning", category: "dependencies", message: "Your agency received a dependency request." },
  DEPENDENCY_REQUEST_RE_SENT: { icon: "↔", tone: "warning", category: "dependencies", message: "A dependency request was sent again." },
  DEPENDENCY_RESPONSE: { icon: "↔", tone: "warning", category: "dependencies", message: "An agency responded to your dependency request." },
  DEPENDENCY_FULFILLED: { icon: "↔", tone: "warning", category: "dependencies", message: "A dependency was marked fulfilled." },
  DEPENDENCY_ESCALATED: { icon: "!", tone: "danger", category: "dependencies", message: "A dependency request passed its response deadline." },
  DEPENDENCY_ASSIGNMENT: { icon: "↓", tone: "info", category: "assignments", message: "A dependency task was assigned to you." },
  PROJECT_ASSIGNMENT: { icon: "↓", tone: "info", category: "assignments", message: "A project was assigned to you." },
  PROJECT_TIMELINE_MODIFIED: { icon: "i", tone: "info", category: "assignments", message: "A project timeline was updated." },
  CONFLICT_DETECTED: { icon: "⚠", tone: "warning", category: "conflicts", message: "A non-blocking project conflict needs review." },
  ROAD_CONFLICT_DETECTED: { icon: "⚠", tone: "warning", category: "conflicts", message: "A non-blocking road conflict needs review." },
  SEQUENCING_RECOMMENDATION: { icon: "⚠", tone: "warning", category: "conflicts", message: "A new advisory sequencing recommendation is ready." },
};

const fallback: NotificationPresentation = {
  icon: "i",
  tone: "info",
  category: "general",
  message: "There is an update to your civic work.",
};

// Part II §6.2 — conflict notifications are deliberately warning amber, never danger red.
export function notificationPresentation(type: string): NotificationPresentation {
  return presentations[type] ?? fallback;
}

export function notificationMatchesFilter(type: string, filter: NotificationFilter): boolean {
  return filter === "all" || notificationPresentation(type).category === filter;
}

function value(payload: Record<string, unknown>, key: string): string | undefined {
  return typeof payload[key] === "string" ? payload[key] : undefined;
}

export function notificationDestination(notification: Pick<Notification, "type" | "payload">, role: UserRole): string | undefined {
  const dependencyId = value(notification.payload, "dependencyId");
  const projectId = value(notification.payload, "projectId");
  const ticketId = value(notification.payload, "ticketId");
  if (dependencyId) {
    if (role === "PROJECT_HEAD") return "/project-head/dependencies/inbox";
    if (role === "ENGINEER") return "/engineer/assigned";
  }
  if (projectId) {
    if (role === "PROJECT_HEAD") return `/project-head/projects/${projectId}`;
    if (role === "ENGINEER") return `/engineer/projects/${projectId}`;
  }
  if (ticketId && role === "PROJECT_HEAD") return `/project-head/tickets/${ticketId}`;
  if (role === "CITIZEN") return ticketId ? `/tickets/${ticketId}` : "/tickets";
  return undefined;
}

export function relativeNotificationTime(createdAt: string | Date, now = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

export function notificationDayGroup(createdAt: string | Date, now = new Date()): "Today" | "Yesterday" | "Earlier" {
  const date = new Date(createdAt);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday.getTime() - 86_400_000);
  if (date >= startToday) return "Today";
  if (date >= startYesterday) return "Yesterday";
  return "Earlier";
}
