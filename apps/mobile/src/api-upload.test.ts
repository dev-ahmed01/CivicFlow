import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalImage } from "./api";

const fileSystem = vi.hoisted(() => ({
  copyAsync: vi.fn(),
  deleteAsync: vi.fn(),
  getInfoAsync: vi.fn(),
  uploadAsync: vi.fn(),
}));

vi.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///app-cache/",
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  copyAsync: fileSystem.copyAsync,
  deleteAsync: fileSystem.deleteAsync,
  getInfoAsync: fileSystem.getInfoAsync,
  uploadAsync: fileSystem.uploadAsync,
}));

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(),
}));

import { uploadFile, validateReportImage } from "./api";

const signedUrl = "https://project.supabase.co/storage/v1/s3/demo/photo?X-Amz-Credential=secret&X-Amz-Signature=top-secret";

function target(contentType: LocalImage["contentType"]) {
  return { uploadUrl: signedUrl, headers: { "Content-Type": contentType } };
}

function image(uri: string, contentType: LocalImage["contentType"]): LocalImage {
  const extension = contentType === "image/jpeg" ? "jpg" : contentType.split("/")[1];
  return { uri, contentType, fileName: `camera.${extension}` };
}

describe("Android presigned image upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileSystem.copyAsync.mockResolvedValue(undefined);
    fileSystem.deleteAsync.mockResolvedValue(undefined);
    fileSystem.getInfoAsync.mockResolvedValue({ exists: true, uri: "file:///cached-photo.jpg", size: 1024, isDirectory: false, modificationTime: 0 });
    fileSystem.uploadAsync.mockResolvedValue({ status: 200, body: "", headers: {} });
  });

  afterEach(() => vi.restoreAllMocks());

  it.each(["image/jpeg", "image/png", "image/heic"] as const)("uploads a file URI as raw %s bytes with the signed header", async (contentType) => {
    await uploadFile(target(contentType), image("file:///camera/photo", contentType));

    expect(fileSystem.copyAsync).not.toHaveBeenCalled();
    expect(fileSystem.uploadAsync).toHaveBeenCalledWith(signedUrl, "file:///camera/photo", {
      httpMethod: "PUT",
      uploadType: 0,
      headers: { "Content-Type": contentType },
    });
  });

  it("stages an Android content URI in the app cache before uploading and removes it afterwards", async () => {
    await uploadFile(target("image/jpeg"), image("content://media/external/images/1234", "image/jpeg"));

    const stagedUri = fileSystem.copyAsync.mock.calls[0]?.[0].to;
    expect(stagedUri).toMatch(/^file:\/\/\/app-cache\/city-connect-upload-.+\.jpg$/);
    expect(fileSystem.copyAsync).toHaveBeenCalledWith({ from: "content://media/external/images/1234", to: stagedUri });
    expect(fileSystem.uploadAsync).toHaveBeenCalledWith(signedUrl, stagedUri, expect.objectContaining({ httpMethod: "PUT", headers: { "Content-Type": "image/jpeg" } }));
    expect(fileSystem.deleteAsync).toHaveBeenCalledWith(stagedUri, { idempotent: true });
  });

  it("logs only safe PUT diagnostics when storage rejects the upload", async () => {
    fileSystem.uploadAsync.mockResolvedValue({ status: 403, body: "signed URL details", headers: {} });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(uploadFile(target("image/png"), image("file:///gallery/photo.png", "image/png"))).rejects.toThrow("Photo upload failed [STAGE_PUT_403]");

    expect(warning).toHaveBeenCalledWith("[City Connect] Photo upload failed", {
      status: 403,
      contentType: "image/png",
      host: "project.supabase.co",
      stage: "STAGE_PUT_403",
    });
    expect(JSON.stringify(warning.mock.calls)).not.toContain("X-Amz-");
    expect(JSON.stringify(warning.mock.calls)).not.toContain("top-secret");
    warning.mockRestore();
  });

  it("does not upload when the presigned and selected content types differ", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(uploadFile(target("image/jpeg"), image("file:///gallery/photo.png", "image/png"))).rejects.toThrow("Photo upload failed [STAGE_CONTENT_TYPE]");

    expect(fileSystem.uploadAsync).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith("[City Connect] Photo upload failed", expect.objectContaining({ status: null, contentType: "image/jpeg", stage: "STAGE_CONTENT_TYPE" }));
    warning.mockRestore();
  });

  it("reports Android content URI staging failures without exposing the URI", async () => {
    fileSystem.copyAsync.mockRejectedValueOnce(new Error("provider path content://private/photo"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(uploadFile(target("image/jpeg"), image("content://media/external/images/1234", "image/jpeg"))).rejects.toThrow("Photo upload failed [STAGE_CONTENT_URI_COPY]");

    expect(fileSystem.getInfoAsync).not.toHaveBeenCalled();
    expect(fileSystem.uploadAsync).not.toHaveBeenCalled();
    expect(JSON.stringify(warning.mock.calls)).not.toContain("content://");
    warning.mockRestore();
  });

  it("reports an unreadable staged or camera file before PUT", async () => {
    fileSystem.getInfoAsync.mockResolvedValueOnce({ exists: false, uri: "file:///private/photo", isDirectory: false });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(uploadFile(target("image/jpeg"), image("file:///camera/photo.jpg", "image/jpeg"))).rejects.toThrow("Photo upload failed [STAGE_LOCAL_FILE_READ]");
    expect(fileSystem.uploadAsync).not.toHaveBeenCalled();
  });

  it("reports a native PUT exception separately from an HTTP response", async () => {
    fileSystem.uploadAsync.mockRejectedValueOnce(new Error("native network failure"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(uploadFile(target("image/jpeg"), image("file:///camera/photo.jpg", "image/jpeg"))).rejects.toThrow("Photo upload failed [STAGE_PUT_NETWORK]");
  });

  it("reports staged-file cleanup separately after a successful PUT", async () => {
    fileSystem.deleteAsync.mockRejectedValueOnce(new Error("cache cleanup failure"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(uploadFile(target("image/jpeg"), image("content://media/external/images/1234", "image/jpeg"))).rejects.toThrow("Photo upload failed [STAGE_CLEANUP]");
  });

  it("does not start relevance completion when the presigned PUT fails", async () => {
    const apiRequest = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      objectKey: "preflight/citizen/photo.jpg",
      upload: target("image/jpeg"),
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    fileSystem.uploadAsync.mockResolvedValue({ status: 403, body: "", headers: {} });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(validateReportImage("category-id", image("file:///camera/IMG_1234.jpg", "image/jpeg"), 1)).rejects.toThrow("Photo upload failed [STAGE_PUT_403]");

    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest.mock.calls[0]?.[0]).toBe("http://10.0.2.2:4000/tickets/image-relevance");
  });

  it("reports presign failures before any local-file or PUT operation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ error: "unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } }));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(validateReportImage("category-id", image("file:///camera/IMG_1234.jpg", "image/jpeg"), 1)).rejects.toThrow("Photo upload failed [STAGE_PRESIGN]");
    expect(fileSystem.getInfoAsync).not.toHaveBeenCalled();
    expect(fileSystem.uploadAsync).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith("[City Connect] Photo flow failed", { stage: "STAGE_PRESIGN", contentType: "image/jpeg", status: null, code: null });
  });

  it.each([401, 400, 500])("surfaces safe free-demo presign HTTP %s diagnostics", async (status) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      error: "Unable to prepare the photo upload",
      code: "PRESIGN_STORAGE_FAILURE",
      diagnostic: "free_demo",
    }), { status, headers: { "Content-Type": "application/json" } }));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(validateReportImage("category-id", image("file:///camera/IMG_1234.jpg", "image/jpeg"), 1))
      .rejects.toThrow(`Photo upload failed [STAGE_PRESIGN_${status}] Unable to prepare the photo upload (PRESIGN_STORAGE_FAILURE)`);
    expect(warning).toHaveBeenCalledWith("[City Connect] Photo flow failed", {
      stage: `STAGE_PRESIGN_${status}`,
      contentType: "image/jpeg",
      status,
      code: "PRESIGN_STORAGE_FAILURE",
    });
    expect(fileSystem.uploadAsync).not.toHaveBeenCalled();
  });

  it("reports relevance completion only after a successful PUT", async () => {
    const apiRequest = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        objectKey: "preflight/citizen/photo.jpg",
        upload: target("image/jpeg"),
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "unavailable" }), { status: 502, headers: { "Content-Type": "application/json" } }));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(validateReportImage("category-id", image("file:///camera/IMG_1234.jpg", "image/jpeg"), 1)).rejects.toThrow("Photo upload failed [STAGE_RELEVANCE_COMPLETE]");
    expect(fileSystem.uploadAsync).toHaveBeenCalledOnce();
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(warning).toHaveBeenCalledWith("[City Connect] Photo flow failed", { stage: "STAGE_RELEVANCE_COMPLETE", contentType: "image/jpeg", status: null, code: null });
  });
});
