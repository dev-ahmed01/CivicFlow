import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "dotenv";
import { getEnv } from "../src/config/env";
import { safeS3ErrorFromBody, S3CompatibleStorage } from "../src/images/storage";

config({ path: resolve(process.cwd(), "../../.env") });

const jpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==",
  "base64",
);

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

type Variant = "A" | "B" | "C";

type SignedUrlInspection = {
  signedHeaders: string | null;
  contentSha256Present: boolean;
  checksumCrc32Present: boolean;
  sdkChecksumAlgorithmPresent: boolean;
};

type VariantUpload = SignedUrlInspection & {
  uploadUrl: string;
  headers?: Record<string, string>;
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

function enterPhase(phase: DiagnosticPhase): void {
  activePhase = phase;
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

function reportEnvParsingFailure(error: unknown): void {
  const issues =
    typeof error === "object" && error !== null && "issues" in error && Array.isArray(error.issues)
      ? error.issues
      : [];
  const invalidVariables = Array.from(
    new Set(
      issues.flatMap((issue: unknown) => {
        if (typeof issue !== "object" || issue === null || !("path" in issue) || !Array.isArray(issue.path)) return [];
        const variable = issue.path[0];
        return typeof variable === "string" && /^[A-Z][A-Z0-9_]*$/.test(variable) ? [variable] : [];
      }),
    ),
  ).sort();

  console.log(JSON.stringify({ code: "DIAG_ENV", invalidVariables }));
  process.exitCode = 1;
}

function inspectSignedUrl(uploadUrl: string): SignedUrlInspection {
  const query = new URL(uploadUrl).searchParams;
  const has = (name: string) => Array.from(query.keys()).some((key) => key.toLowerCase() === name);
  return {
    signedHeaders: query.get("X-Amz-SignedHeaders"),
    contentSha256Present: has("x-amz-content-sha256"),
    checksumCrc32Present: has("x-amz-checksum-crc32"),
    sdkChecksumAlgorithmPresent: has("x-amz-sdk-checksum-algorithm"),
  };
}

function reportVariant(
  variant: Variant,
  status: number | null,
  code: string,
  inspection: SignedUrlInspection,
): void {
  console.log(
    JSON.stringify({
      variant,
      status,
      code,
      xAmzSignedHeaders: inspection.signedHeaders,
      xAmzContentSha256QueryPresent: inspection.contentSha256Present,
    }),
  );
}

function createClient(env: ReturnType<typeof getEnv>): S3Client {
  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
}

async function createVariantUpload(
  variant: Variant,
  client: S3Client,
  storage: S3CompatibleStorage,
  env: ReturnType<typeof getEnv>,
  objectKey: string,
): Promise<VariantUpload> {
  if (variant === "C") {
    const upload = await storage.createUpload(objectKey, "image/jpeg");
    return { uploadUrl: upload.uploadUrl, headers: upload.headers, ...inspectSignedUrl(upload.uploadUrl) };
  }

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: objectKey,
      ...(variant === "B" ? { ContentType: "image/jpeg" } : {}),
    }),
    { expiresIn: 900 },
  );
  return {
    uploadUrl,
    headers: variant === "B" ? { "Content-Type": "image/jpeg" } : undefined,
    ...inspectSignedUrl(uploadUrl),
  };
}

async function runVariant(
  variant: Variant,
  client: S3Client,
  storage: S3CompatibleStorage,
  env: ReturnType<typeof getEnv>,
): Promise<{ succeeded: boolean; checksumParametersPresent: boolean }> {
  const objectKey = `diagnostics/presigned-put/${variant.toLowerCase()}-${randomUUID()}.jpg`;
  enterPhase("DIAG_PRESIGN");

  let upload: VariantUpload;
  try {
    upload = await createVariantUpload(variant, client, storage, env, objectKey);
  } catch {
    reportVariant(variant, null, "DIAG_PRESIGN", {
      signedHeaders: null,
      contentSha256Present: false,
      checksumCrc32Present: false,
      sdkChecksumAlgorithmPresent: false,
    });
    return { succeeded: false, checksumParametersPresent: false };
  }

  enterPhase("DIAG_FETCH");
  let response: Response;
  try {
    response = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: upload.headers,
      body: jpeg,
    });
  } catch {
    reportVariant(variant, null, "DIAG_FETCH", upload);
    return {
      succeeded: false,
      checksumParametersPresent: upload.checksumCrc32Present || upload.sdkChecksumAlgorithmPresent,
    };
  }

  enterPhase("DIAG_RESPONSE_PARSE");
  let safeError: ReturnType<typeof safeS3ErrorFromBody>;
  try {
    safeError = safeS3ErrorFromBody((await response.text()).slice(0, 4096));
  } catch {
    reportVariant(variant, null, "DIAG_RESPONSE_PARSE", upload);
    return {
      succeeded: false,
      checksumParametersPresent: upload.checksumCrc32Present || upload.sdkChecksumAlgorithmPresent,
    };
  }

  reportVariant(variant, response.status, safeError?.code ?? (response.ok ? "OK" : "UNKNOWN_STORAGE_ERROR"), upload);

  if (response.ok) {
    enterPhase("DIAG_CLEANUP");
    try {
      await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: objectKey }));
    } catch {
      // Cleanup is best-effort and never exposes the diagnostic object path.
    }
  }

  return {
    succeeded: response.ok,
    checksumParametersPresent: upload.checksumCrc32Present || upload.sdkChecksumAlgorithmPresent,
  };
}

async function main(): Promise<void> {
  enterPhase("DIAG_ENV");
  const configPresence = getConfigPresence();

  let env: ReturnType<typeof getEnv>;
  try {
    env = getEnv();
  } catch (error) {
    reportEnvParsingFailure(error);
    return;
  }

  if (env.DEPLOYMENT_PROFILE !== "free_demo") {
    const error = new Error();
    error.name = "DeploymentProfileError";
    reportFailure("DIAG_ENV", error);
    return;
  }

  if (Object.values(configPresence).some((present) => !present)) {
    const error = new Error();
    error.name = "StorageConfigError";
    reportFailure("DIAG_ENV", error);
    return;
  }

  enterPhase("DIAG_STORAGE_INIT");
  let storage: S3CompatibleStorage;
  let client: S3Client;
  try {
    storage = new S3CompatibleStorage(env);
    client = createClient(env);
  } catch (error) {
    reportFailure("DIAG_STORAGE_INIT", error);
    return;
  }

  try {
    const results = [];
    for (const variant of ["A", "B", "C"] as const) {
      results.push(await runVariant(variant, client, storage, env));
    }
    if (results.some((result) => !result.succeeded)) process.exitCode = 1;
    // Retain this inspection in-process so checksum query behavior is tested
    // without printing parameter values or expanding the per-variant output.
    void results.some((result) => result.checksumParametersPresent);
  } finally {
    client.destroy();
  }
}

void main().catch((error: unknown) => {
  reportFailure(activePhase, error);
});
