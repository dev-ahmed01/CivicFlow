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
type DiagnosticPhase =
  | "DIAG_ENV"
  | "DIAG_STORAGE_INIT"
  | "DIAG_PRESIGN"
  | "DIAG_FETCH"
  | "DIAG_RESPONSE_PARSE"
  | "DIAG_CLEANUP";

type ConfigPresence = {
  endpointPresent: boolean;
  regionPresent: boolean;
  bucketPresent: boolean;
  accessKeyPresent: boolean;
  secretPresent: boolean;
  publicBasePresent: boolean;
};

let activePhase: DiagnosticPhase = "DIAG_ENV";

function isPresent(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function getConfigPresence(): ConfigPresence {
  return {
    endpointPresent: isPresent(process.env.S3_ENDPOINT),
    regionPresent: isPresent(process.env.S3_REGION),
    bucketPresent: isPresent(process.env.S3_BUCKET),
    accessKeyPresent: isPresent(process.env.S3_ACCESS_KEY_ID),
    secretPresent: isPresent(process.env.S3_SECRET_ACCESS_KEY),
    publicBasePresent: isPresent(process.env.S3_PUBLIC_BASE_URL),
  };
}

function errorType(error: unknown): string {
  return error instanceof Error && error.name ? error.name : "UnknownError";
}

function reportPhase(phase: DiagnosticPhase, configPresence?: ConfigPresence): void {
  activePhase = phase;
  console.log(JSON.stringify({ phase, ...configPresence }));
}

function reportFailure(code: DiagnosticPhase, error: unknown): void {
  console.log(
    JSON.stringify({
      status: null,
      code,
      errorType: errorType(error),
      serverSidePut: false,
    }),
  );
  process.exitCode = 1;
}

function report(status: number | null, code: string, serverSidePut: boolean, cleanup: CleanupStatus): void {
  console.log(JSON.stringify({ status, code, serverSidePut, cleanup }));
}

async function main(): Promise<void> {
  reportPhase("DIAG_ENV", getConfigPresence());

  let env: ReturnType<typeof getEnv>;
  try {
    env = getEnv();
  } catch (error) {
    reportFailure("DIAG_ENV", error);
    return;
  }

  if (env.DEPLOYMENT_PROFILE !== "free_demo") {
    const error = new Error();
    error.name = "DeploymentProfileError";
    reportFailure("DIAG_ENV", error);
    return;
  }

  const objectKey = `diagnostics/presigned-put/${randomUUID()}.jpg`;
  reportPhase("DIAG_STORAGE_INIT");
  let storage: S3CompatibleStorage;
  try {
    storage = new S3CompatibleStorage(env);
  } catch (error) {
    reportFailure("DIAG_STORAGE_INIT", error);
    return;
  }

  reportPhase("DIAG_PRESIGN");
  let upload;
  try {
    upload = await storage.createUpload(objectKey, "image/jpeg");
  } catch (error) {
    reportFailure("DIAG_PRESIGN", error);
    return;
  }

  reportPhase("DIAG_FETCH");
  let response: Response;
  try {
    response = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: upload.headers,
      body: jpeg,
    });
  } catch (error) {
    reportFailure("DIAG_FETCH", error);
    return;
  }

  reportPhase("DIAG_RESPONSE_PARSE");
  let safeError: ReturnType<typeof safeS3ErrorFromBody>;
  try {
    safeError = safeS3ErrorFromBody((await response.text()).slice(0, 4096));
  } catch (error) {
    reportFailure("DIAG_RESPONSE_PARSE", error);
    return;
  }

  let cleanup: CleanupStatus = "not_needed";
  if (response.ok) {
    reportPhase("DIAG_CLEANUP");
    let client: S3Client | undefined;
    try {
      client = new S3Client({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        forcePathStyle: true,
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        },
      });
      await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: objectKey }));
      cleanup = "deleted";
    } catch (error) {
      reportFailure("DIAG_CLEANUP", error);
      return;
    } finally {
      client?.destroy();
    }
  }

  report(response.status, safeError?.code ?? (response.ok ? "OK" : "UNKNOWN_STORAGE_ERROR"), response.ok, cleanup);
  if (!response.ok) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  reportFailure(activePhase, error);
});
