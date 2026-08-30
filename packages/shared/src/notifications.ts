import type { Notification, UserRole } from "./schemas";

export type NotificationTone = "info" | "success" | "warning" | "danger";
export type NotificationFilter = "all" | "dependencies" | "assignments" | "conflicts" | "completion" | "grievances";

export type NotificationPresentation = {
  icon: string;
  tone: NotificationTone;
  category: Exclude<NotificationFilter, "all"> | "general";
  message: string;
};

const presentations: Record<string, NotificationPresentation> = {
  VALIDATION_REQUEST: { icon: "i", tone: "info", category: "general", message: "A civic issue needs your validation." },
  TICKET_VALIDATED: { icon: "✓", tone: "success", category: "general", message: "Your report reached the required community confirmations." },
  TICKET_ROUTED_TO_AGENCY: { icon: "✓", tone: "success", category: "general", message: "Your issue has been routed to the responsible agency." },
  PROJECT_CREATED: { icon: "↓", tone: "info", category: "assignments", message: "An engineer has been assigned." },
  PROJECT_ACTIVE: { icon: "▶", tone: "info", category: "assignments", message: "Work has started on this issue." },
  WORK_STARTED: { icon: "▶", tone: "info", category: "assignments", message: "Work has started on this issue." },
  PROJECT_COMPLETED: { icon: "◆", tone: "warning", category: "completion", message: "Work is complete and awaiting evidence review." },
  WORK_COMPLETED: { icon: "◆", tone: "warning", category: "completion", message: "The agency marked this work complete." },
  COMPLETION_VERIFICATION_REQUEST: { icon: "◆", tone: "warning", category: "completion", message: "Work completed — verify the resolution." },
  TICKET_RESOLVED: { icon: "✓", tone: "success", category: "completion", message: "This civic issue has been resolved." },
  COMPLETION_VERIFIED: { icon: "✓", tone: "success", category: "completion", message: "Citizens verified the completed work." },
  PROJECT_REWORK_REQUESTED: { icon: "◆", tone: "warning", category: "completion", message: "Citizens requested more work before closure." },
  DEPENDENCY_REQUEST: { icon: "↔", tone: "warning", category: "dependencies", message: "Your agency received a dependency request." },
  DEPENDENCY_REQUEST_RE_SENT: { icon: "↔", tone: "warning", category: "dependencies", message: "A dependency request was sent again." },
  DEPENDENCY_RESPONSE: { icon: "↔", tone: "warning", category: "dependencies", message: "An agency responded to your dependency request." },
  DEPENDENCY_FULFILLED: { icon: "↔", tone: "warning", category: "dependencies", message: "A dependency was marked fulfilled." },
  DEPENDENCY_ESCALATED: { icon: "!", tone: "danger", category: "dependencies", message: "A dependency request passed its response deadline." },
  DEPENDENCY_DEADLINE_APPROACHING: { icon: "!", tone: "warning", category: "dependencies", message: "A coordination response deadline is approaching." },
  DEPENDENCY_ASSIGNMENT: { icon: "↓", tone: "info", category: "assignments", message: "A dependency task was assigned to you." },
  COORDINATION_REQUEST: { icon: "↔", tone: "warning", category: "dependencies", message: "Your agency received a coordination request." },
  COORDINATION_REPLY: { icon: "i", tone: "info", category: "dependencies", message: "A coordination request has a new reply." },
  COORDINATION_ENGINEER_ASSIGNED: { icon: "↓", tone: "info", category: "assignments", message: "You were assigned to an inter-agency coordination action." },
  DEPENDENCY_ACCEPTED: { icon: "✓", tone: "success", category: "dependencies", message: "An agency accepted the formal dependency." },
  SEQUENCE_CHANGED: { icon: "i", tone: "info", category: "conflicts", message: "An agreed work sequence or planned date changed." },
  PROJECT_ASSIGNMENT: { icon: "↓", tone: "info", category: "assignments", message: "A project was assigned to you." },
  PROJECT_TIMELINE_MODIFIED: { icon: "i", tone: "info", category: "assignments", message: "A project timeline was updated." },
  CONFLICT_DETECTED: { icon: "⚠", tone: "warning", category: "conflicts", message: "A non-blocking project conflict needs review." },
  ROAD_CONFLICT_DETECTED: { icon: "⚠", tone: "warning", category: "conflicts", message: "A non-blocking road conflict needs review." },
  SEQUENCING_RECOMMENDATION: { icon: "⚠", tone: "warning", category: "conflicts", message: "A new advisory sequencing recommendation is ready." },
  ACTION_ATTENTION: { icon: "!", tone: "danger", category: "assignments", message: "A response deadline needs immediate attention." },
  GRIEVANCE_CREATED: { icon: "!", tone: "danger", category: "grievances", message: "A citizen grievance needs review." },
  GRIEVANCE_ESCALATED: { icon: "!", tone: "danger", category: "grievances", message: "Non-response created an escalated grievance." },
  GRIEVANCE_UPDATED: { icon: "i", tone: "info", category: "grievances", message: "Your grievance has a new review update." },
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
  const coordinationRequestId = value(notification.payload, "coordinationRequestId");
  const dependencyId = value(notification.payload, "dependencyId");
  const projectId = value(notification.payload, "projectId");
  const ticketId = value(notification.payload, "ticketId");
  const grievanceId = value(notification.payload, "grievanceId");
  if (coordinationRequestId && role === "PROJECT_HEAD") return `/project-head/coordination/${coordinationRequestId}`;
  if (grievanceId) {
    if (role === "PROJECT_HEAD") return `/project-head/grievances?grievance=${grievanceId}`;
    if (role === "ADMIN") return `/admin/grievances?grievance=${grievanceId}`;
  }
  if (dependencyId) {
    if (role === "PROJECT_HEAD") return "/project-head/dependencies/inbox";
    if (role === "ENGINEER") return "/engineer/dependencies";
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
