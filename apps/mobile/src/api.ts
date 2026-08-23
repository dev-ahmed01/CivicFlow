import type { CategorySummary, CitizenTicketSummary } from "@civicos/shared";

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:4000";
const accessToken = process.env.EXPO_PUBLIC_ACCESS_TOKEN ?? "";

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
