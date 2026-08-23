import type {
  CategorySummary,
  CitizenTicketSummary,
  CompletionVerificationDecision,
  DependencyListItem,
  DependencyResponse,
  EngineerProjectDetail,
  Notification,
  PendingValidation,
  PendingCompletionVerification,
  ProjectConflict,
  RoadConflict,
  ProjectListItem,
  ProjectState,
  SubmitValidationResult,
  UserRole,
  ValidationVote,
} from "@civicos/shared";

function resolveApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("EXPO_PUBLIC_API_URL is required for production mobile builds");
  }
  return "http://10.0.2.2:4000";
}

const apiUrl = resolveApiUrl();
let accessToken = process.env.EXPO_PUBLIC_ACCESS_TOKEN ?? "";

type LocalImage = { uri: string; fileName: string; contentType: "image/jpeg" | "image/png" | "image/webp" | "image/heic" };
type UploadTarget = { uploadUrl: string; headers: { "Content-Type": string } };

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body;
}

export type CurrentAuth = {
  userId: string;
  role: UserRole;
  agencyId: string | null;
  wardId: string | null;
  mustResetPassword: boolean;
};

export async function loadCurrentAuth(): Promise<CurrentAuth> {
  const result = await apiFetch<{ auth: CurrentAuth }>("/protected/me");
  return result.auth;
}

export async function internalLogin(email: string, password: string): Promise<CurrentAuth> {
  const result = await apiFetch<{
    user: { id: string; role: UserRole; agencyId: string | null };
    accessToken: string;
    requiresPasswordReset: boolean;
  }>("/auth/internal/login", { method: "POST", body: JSON.stringify({ email, password }) });
  if (result.user.role !== "ENGINEER" || !result.user.agencyId) throw new Error("Use an Executive Engineer account");
  if (result.requiresPasswordReset) throw new Error("Reset this account's temporary password before continuing");
  accessToken = result.accessToken;
  return { userId: result.user.id, role: result.user.role, agencyId: result.user.agencyId, wardId: null, mustResetPassword: false };
}

export async function requestCitizenOtp(phone: string): Promise<void> {
  await apiFetch("/auth/citizen/request-otp", { method: "POST", body: JSON.stringify({ phone }) });
}

export async function verifyCitizenOtp(phone: string, code: string): Promise<CurrentAuth> {
  const result = await apiFetch<{ user: { id: string; role: UserRole }; accessToken: string }>("/auth/citizen/verify-otp", { method: "POST", body: JSON.stringify({ phone, code }) });
  if (result.user.role !== "CITIZEN") throw new Error("Use a citizen account");
  accessToken = result.accessToken;
  return { userId: result.user.id, role: result.user.role, agencyId: null, wardId: null, mustResetPassword: false };
}

export function clearInternalSession(): void {
  accessToken = "";
}

export const clearCitizenSession = clearInternalSession;

export async function loadDependencies(direction: "sent" | "received"): Promise<DependencyListItem[]> {
  const result = await apiFetch<{ dependencies: DependencyListItem[] }>(`/dependencies?direction=${direction}`);
  return result.dependencies;
}

export async function respondToDependency(dependencyId: string, response: DependencyResponse): Promise<void> {
  await apiFetch(`/dependencies/${dependencyId}/respond`, {
    method: "POST",
    body: JSON.stringify(response),
  });
}

export async function loadEngineerProjects(scope: "mine" | "assigned" | "geographic", filters: { agencyId?: string; status?: ProjectState } = {}): Promise<ProjectListItem[]> {
  const query = new URLSearchParams({ scope });
  if (filters.agencyId) query.set("agency", filters.agencyId);
  if (filters.status) query.set("status", filters.status);
  const result = await apiFetch<{ projects: ProjectListItem[] }>(`/projects?${query.toString()}`);
  return result.projects;
}

export async function loadEngineerProject(projectId: string): Promise<EngineerProjectDetail> {
  const result = await apiFetch<{ project: EngineerProjectDetail }>(`/projects/${projectId}`);
  return result.project;
}

export async function uptakeProject(projectId: string): Promise<void> {
  await apiFetch(`/projects/${projectId}/uptake`, { method: "POST" });
}

export async function updateProjectTimeline(projectId: string, input: { plannedStart: string; plannedEnd: string; workDescription: string; dependencyFlags: string[] }): Promise<ProjectConflict[]> {
  const result = await apiFetch<{ conflicts: ProjectConflict[]; roadConflicts: RoadConflict[] }>(`/projects/${projectId}/timeline`, { method: "PATCH", body: JSON.stringify(input) });
  // M-E6 — preserve the established warning sheet while labeling road-specific checks.
  const roadWarnings: ProjectConflict[] = result.roadConflicts.map((conflict) => ({
    id: conflict.id,
    projectId: conflict.projectId,
    conflictingProjectId: conflict.conflictingProjectId ?? conflict.projectId,
    conflictingProjectName: `Road · ${conflict.type.replaceAll("_", " ")}`,
    conflictingAgency: conflict.conflictingAgency ?? { id: conflict.projectId, name: "Single-record segment risk" },
    overlapStart: new Date(input.plannedStart),
    overlapEnd: new Date(input.plannedEnd),
    locationDescription: conflict.segmentName,
    distanceMeters: null,
    reason: conflict.reason,
    severity: conflict.severity === "HIGH" ? "PROMINENT" : "INLINE",
    detectedAt: conflict.detectedAt,
  }));
  return [...result.conflicts, ...roadWarnings];
}

export async function updateProjectStatus(projectId: string, input: { state?: "COMPLETED"; note?: string }): Promise<void> {
  await apiFetch(`/projects/${projectId}/status`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function submitCompletionEvidence(projectId: string, image: LocalImage, notes: string): Promise<void> {
  const target = await apiFetch<{ evidenceId: string; upload: UploadTarget }>(`/projects/${projectId}/completion`, {
    method: "POST",
    body: JSON.stringify({ action: "presign", fileName: image.fileName, contentType: image.contentType, notes }),
  });
  await uploadFile(target.upload, image);
  await apiFetch(`/projects/${projectId}/completion`, { method: "POST", body: JSON.stringify({ action: "complete", evidenceId: target.evidenceId }) });
}

export async function loadAgencies(): Promise<Array<{ id: string; name: string }>> {
  const result = await apiFetch<{ agencies: Array<{ id: string; name: string }> }>("/agencies");
  return result.agencies;
}

async function uploadFile(target: UploadTarget, image: LocalImage): Promise<void> {
  const blob = await fetch(image.uri).then((response) => response.blob());
  const response = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: blob });
  if (!response.ok) throw new Error("Photo upload failed");
}

export async function loadCategories(): Promise<CategorySummary[]> {
  const result = await apiFetch<{ categories: CategorySummary[] }>("/categories");
  return result.categories;
}

export async function loadMyTickets(filter: "ongoing" | "past"): Promise<CitizenTicketSummary[]> {
  const result = await apiFetch<{ tickets: CitizenTicketSummary[] }>(`/citizens/me/tickets?filter=${filter}`);
  return result.tickets;
}

export async function loadPendingValidations(): Promise<PendingValidation[]> {
  const result = await apiFetch<{ validations: PendingValidation[] }>("/citizens/me/pending-validations");
  return result.validations;
}

export async function updateCitizenLocation(latitude: number, longitude: number): Promise<void> {
  await apiFetch("/citizens/me/location", {
    method: "PATCH",
    body: JSON.stringify({ latitude, longitude }),
  });
}

export async function validateTicket(ticketId: string, vote: ValidationVote): Promise<SubmitValidationResult> {
  return apiFetch<SubmitValidationResult>(`/tickets/${ticketId}/validate`, {
    method: "POST",
    body: JSON.stringify({ vote }),
  });
}

export async function loadPendingCompletionVerifications(): Promise<PendingCompletionVerification[]> {
  const result = await apiFetch<{ completions: PendingCompletionVerification[] }>("/citizens/me/pending-completion-verifications");
  return result.completions;
}

export async function verifyCompletion(evidenceId: string, decision: CompletionVerificationDecision, note?: string): Promise<void> {
  await apiFetch(`/completion-evidence/${evidenceId}/verify`, {
    method: "POST",
    body: JSON.stringify({ decision, note }),
  });
}

export type MobileNotification = Omit<Notification, "createdAt"> & { createdAt: string };

export async function loadNotifications(unread?: boolean): Promise<{ notifications: MobileNotification[]; unreadCount: number }> {
  const query = unread === undefined ? "" : `?unread=${String(unread)}`;
  return apiFetch(`/notifications${query}`);
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await apiFetch(`/notifications/${notificationId}/read`, { method: "PATCH" });
}

export async function registerPushToken(token: string, platform: "ios" | "android"): Promise<void> {
  await apiFetch("/notifications/push-tokens", { method: "POST", body: JSON.stringify({ token, platform }) });
}

export type DraftReport = {
  categoryId: string;
  title: string;
  address: string;
  latitude: number;
  longitude: number;
  note?: string;
};

export type SubmissionResult =
  | { needsRetake: true; ticketId: string; message: string; attemptsRemaining: number }
  | { needsRetake: false; ticket: CitizenTicketSummary };

export async function submitReport(
  report: DraftReport,
  primary: LocalImage,
  supporting: LocalImage[],
  draftTicketId?: string,
): Promise<SubmissionResult> {
  let ticketId = draftTicketId;
  let primaryImageId: string;
  let primaryUpload: UploadTarget;

  if (!ticketId) {
    const created = await apiFetch<{ ticketId: string; imageId: string; upload: UploadTarget }>("/tickets", {
      method: "POST",
      body: JSON.stringify({ ...report, primaryImage: { fileName: primary.fileName, contentType: primary.contentType } }),
    });
    ticketId = created.ticketId;
    primaryImageId = created.imageId;
    primaryUpload = created.upload;
  } else {
    const retake = await apiFetch<{ imageId: string; upload: UploadTarget }>(`/tickets/${ticketId}/images`, {
      method: "POST",
      body: JSON.stringify({ action: "presign", fileName: primary.fileName, contentType: primary.contentType, isPrimary: true }),
    });
    primaryImageId = retake.imageId;
    primaryUpload = retake.upload;
  }

  await uploadFile(primaryUpload, primary);
  for (const image of supporting) {
    const target = await apiFetch<{ imageId: string; upload: UploadTarget }>(`/tickets/${ticketId}/images`, {
      method: "POST",
      body: JSON.stringify({ action: "presign", fileName: image.fileName, contentType: image.contentType, isPrimary: false }),
    });
    await uploadFile(target.upload, image);
    await apiFetch(`/tickets/${ticketId}/images`, {
      method: "POST",
      body: JSON.stringify({ action: "complete", imageId: target.imageId }),
    });
  }

  return apiFetch<SubmissionResult>(`/tickets/${ticketId}/images`, {
    method: "POST",
    body: JSON.stringify({ action: "complete", imageId: primaryImageId }),
  });
}

export type { LocalImage };
