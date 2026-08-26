import type {
  CategorySummary,
  CitizenTicketSummary,
  CitizenTicketTimelineResponse,
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
import * as SecureStore from "expo-secure-store";

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
let refreshToken = "";
let currentAuth: CurrentAuth | undefined;
const sessionKey = "civicos.mobile.session.v1";
let hydration: Promise<void> | undefined;
let refreshInFlight: Promise<TokenResponse> | undefined;

type LocalImage = { uri: string; fileName: string; contentType: "image/jpeg" | "image/png" | "image/webp" | "image/heic" };
type UploadTarget = { uploadUrl: string; headers: { "Content-Type": string } };

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  await hydrateSession();
  const request = (token: string) => fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  let response: Response;
  try { response = await request(accessToken); }
  catch (cause) { throw new Error("The CivicFlow service is unreachable. Check your connection and try again.", { cause }); }
  if (response.status === 401 && refreshToken && path !== "/auth/refresh" && path !== "/auth/logout") {
    try {
      const tokenToRotate = refreshToken;
      refreshInFlight ??= rawTokenRequest("/auth/refresh", { refreshToken: tokenToRotate }).finally(() => { refreshInFlight = undefined; });
      const rotated = await refreshInFlight;
      accessToken = rotated.accessToken;
      refreshToken = rotated.refreshToken;
      await persistSession();
      response = await request(accessToken);
    } catch (cause) {
      await clearInternalSession();
      throw new Error("Your session expired. Please sign in again.", { cause });
    }
  }
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

type TokenResponse = { accessToken: string; refreshToken: string; expiresIn: string };

async function rawTokenRequest(path: string, payload: Record<string, string>): Promise<TokenResponse> {
  let response: Response;
  try { response = await fetch(`${apiUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
  catch (cause) { throw new Error("The CivicFlow service is unreachable. Check your connection and try again.", { cause }); }
  const body = await response.json().catch(() => ({})) as TokenResponse & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Session expired. Please sign in again.");
  return body;
}

async function persistSession(): Promise<void> {
  if (!currentAuth || !accessToken || !refreshToken) return;
  await SecureStore.setItemAsync(sessionKey, JSON.stringify({ accessToken, refreshToken, auth: currentAuth }));
}

async function hydrateSession(): Promise<void> {
  hydration ??= (async () => {
    const stored = await SecureStore.getItemAsync(sessionKey);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as { accessToken: string; refreshToken: string; auth: CurrentAuth };
      accessToken = parsed.accessToken;
      refreshToken = parsed.refreshToken;
      currentAuth = parsed.auth;
    } catch {
      await SecureStore.deleteItemAsync(sessionKey);
    }
  })();
  await hydration;
}

export type CurrentAuth = {
  userId: string;
  role: UserRole;
  agencyId: string | null;
  wardId: string | null;
  mustResetPassword: boolean;
};

export async function loadCurrentAuth(): Promise<CurrentAuth> {
  await hydrateSession();
  if (!accessToken) throw new Error("No saved session");
  const result = await apiFetch<{ auth: CurrentAuth }>("/protected/me");
  currentAuth = result.auth;
  await persistSession();
  return result.auth;
}

export async function internalLogin(email: string, password: string): Promise<CurrentAuth> {
  const result = await apiFetch<{
    user: { id: string; role: UserRole; agencyId: string | null };
    accessToken: string;
    refreshToken: string;
    requiresPasswordReset: boolean;
  }>("/auth/internal/login", { method: "POST", body: JSON.stringify({ email, password, expectedRole: "ENGINEER" }) });
  if (result.user.role !== "ENGINEER" || !result.user.agencyId) throw new Error("Use an Executive Engineer account");
  accessToken = result.accessToken;
  refreshToken = result.refreshToken;
  currentAuth = { userId: result.user.id, role: result.user.role, agencyId: result.user.agencyId, wardId: null, mustResetPassword: result.requiresPasswordReset };
  await persistSession();
  return currentAuth;
}

export async function requestCitizenOtp(phone: string): Promise<{ demoMode: boolean }> {
  return apiFetch<{ demoMode: boolean }>("/auth/citizen/request-otp", { method: "POST", body: JSON.stringify({ phone }) });
}

export async function verifyCitizenOtp(phone: string, code: string): Promise<CurrentAuth> {
  const result = await apiFetch<{ user: { id: string; role: UserRole }; accessToken: string; refreshToken: string }>("/auth/citizen/verify-otp", { method: "POST", body: JSON.stringify({ phone, code }) });
  if (result.user.role !== "CITIZEN") throw new Error("Use a citizen account");
  accessToken = result.accessToken;
  refreshToken = result.refreshToken;
  currentAuth = { userId: result.user.id, role: result.user.role, agencyId: null, wardId: null, mustResetPassword: false };
  await persistSession();
  return currentAuth;
}

export async function clearInternalSession(): Promise<void> {
  accessToken = "";
  refreshToken = "";
  currentAuth = undefined;
  hydration = Promise.resolve();
  await SecureStore.deleteItemAsync(sessionKey);
}

export const clearCitizenSession = clearInternalSession;

export async function logoutSession(): Promise<void> {
  await hydrateSession();
  const token = refreshToken;
  await clearInternalSession();
  if (token) {
    try { await rawTokenRequest("/auth/logout", { refreshToken: token }); }
    catch { /* The local session must still be removed while offline. */ }
  }
}

export async function resetInternalPassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch("/auth/internal/reset-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
  await clearInternalSession();
}

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
  query.set("limit", "50");
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
  let blob: Blob;
  let response: Response;
  try {
    blob = await fetch(image.uri).then((result) => {
      if (!result.ok) throw new Error("The selected photo is no longer available");
      return result.blob();
    });
    response = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: blob });
  } catch (cause) {
    throw new Error("The photo could not be uploaded. Check your connection and try again.", { cause });
  }
  if (!response.ok) throw new Error("Photo upload failed");
}

export async function loadCategories(): Promise<CategorySummary[]> {
  const result = await apiFetch<{ categories: CategorySummary[] }>("/categories");
  return result.categories;
}

export async function loadMyTickets(filter: "ongoing" | "past"): Promise<CitizenTicketSummary[]> {
  const result = await apiFetch<{ tickets: CitizenTicketSummary[] }>(`/citizens/me/tickets?filter=${filter}&limit=50`);
  return result.tickets;
}

export async function loadTicket(ticketId: string): Promise<{ ticket: CitizenTicketSummary } & CitizenTicketTimelineResponse> {
  const [detail, timeline] = await Promise.all([
    apiFetch<{ ticket: CitizenTicketSummary }>(`/tickets/${ticketId}`),
    apiFetch<CitizenTicketTimelineResponse>(`/tickets/${ticketId}/timeline`),
  ]);
  return { ticket: detail.ticket, ...timeline };
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
  const query = unread === undefined ? "?limit=50" : `?unread=${String(unread)}&limit=50`;
  return apiFetch(`/notifications${query}`);
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (ids.length > 0) await apiFetch("/notifications/read", { method: "PATCH", body: JSON.stringify({ ids }) });
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
      body: JSON.stringify({ ...report, channel: "MOBILE", primaryImage: { fileName: primary.fileName, contentType: primary.contentType } }),
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
