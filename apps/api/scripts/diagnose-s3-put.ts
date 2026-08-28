import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "dotenv";
import { getEnv } from "../src/config/env";
import { safeS3ErrorFromBody, S3CompatibleStorage } from "../src/images/storage";

config({ path: resolve(process.cwd(), "../../.env") });

const jpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==",
  "base64",
);

type CleanupStatus = "deleted" | "failed" | "not_needed";

function report(status: number | null, code: string, serverSidePut: boolean, cleanup: CleanupStatus): void {
  console.log(JSON.stringify({ status, code, serverSidePut, cleanup }));
}

async function main(): Promise<void> {
  const env = getEnv();
  if (env.DEPLOYMENT_PROFILE !== "free_demo") {
    report(null, "FREE_DEMO_REQUIRED", false, "not_needed");
    process.exitCode = 1;
    return;
  }

  const objectKey = `diagnostics/presigned-put/${randomUUID()}.jpg`;
  const storage = new S3CompatibleStorage(env);
  let upload;
  try {
    upload = await storage.createUpload(objectKey, "image/jpeg");
  } catch {
    report(null, "PRESIGN_ERROR", false, "not_needed");
    process.exitCode = 1;
    return;
  }

  let response: Response;
  try {
    response = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: upload.headers,
      body: jpeg,
    });
  } catch {
    report(null, "NETWORK_ERROR", false, "not_needed");
    process.exitCode = 1;
    return;
  }

  const safeError = safeS3ErrorFromBody((await response.text()).slice(0, 4096));
  let cleanup: CleanupStatus = "not_needed";
  if (response.ok) {
    const client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
    try {
      await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: objectKey }));
      cleanup = "deleted";
    } catch {
      cleanup = "failed";
    } finally {
      client.destroy();
    }
  }

  report(response.status, safeError?.code ?? (response.ok ? "OK" : "UNKNOWN_STORAGE_ERROR"), response.ok, cleanup);
  if (!response.ok) process.exitCode = 1;
}

void main().catch(() => {
  report(null, "DIAGNOSTIC_ERROR", false, "not_needed");
  process.exitCode = 1;
});
