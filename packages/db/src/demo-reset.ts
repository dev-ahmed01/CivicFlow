import { Prisma } from "@prisma/client";

export function assertDemoResetAllowed(env: NodeJS.ProcessEnv): string {
  if (env.ALLOW_DEMO_RESET !== "true") throw new Error("Reset refused: set ALLOW_DEMO_RESET=true explicitly.");
  if (!env.DATABASE_URL) throw new Error("Reset refused: DATABASE_URL is required.");
  const url = new URL(env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Reset requires PostgreSQL.");
  const target = `${url.hostname}:${url.port || "5432"}${url.pathname}`;
  if (env.DEMO_RESET_TARGET !== target) throw new Error(`Reset refused: DEMO_RESET_TARGET must exactly equal ${target} (no credentials).`);
  if (url.searchParams.get("schema") && url.searchParams.get("schema") !== "public") throw new Error("Reset requires the public demo schema.");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!local || env.NODE_ENV === "production") && env.ALLOW_REMOTE_DEMO_RESET !== "I_UNDERSTAND_ALL_APPLICATION_DATA_WILL_BE_REPLACED") {
    throw new Error("Remote/production reset refused: purpose-built ALLOW_REMOTE_DEMO_RESET acknowledgement is required.");
  }
  return target;
}

// Schema-authoritative FK ordering. Fail on cycles rather than disabling constraints.
// System configuration and reference counters survive; canonical demo configuration is upserted.
export function demoDeletionOrder(): string[] {
  const preserved = new Set(["SystemConfig", "TicketReferenceCounter", "CivicWorkReferenceCounter"]);
  const remaining = new Map(Prisma.dmmf.datamodel.models.filter((m) => !preserved.has(m.name)).map((m) => [m.name, m]));
  const result: string[] = [];
  while (remaining.size) {
    const parents = new Set([...remaining.values()].flatMap((m) => m.fields.filter((f) => f.relationFromFields?.length && f.type !== m.name).map((f) => f.type)));
    const leaves = [...remaining.values()].filter((m) => !parents.has(m.name));
    if (!leaves.length) throw new Error("Schema FK cycle: review demo reset ordering before continuing.");
    for (const model of leaves) { result.push(model.dbName ?? model.name); remaining.delete(model.name); }
  }
  return result;
}

export async function clearDemoDatabase(transaction: Prisma.TransactionClient): Promise<void> {
  for (const table of demoDeletionOrder()) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(table)) throw new Error("Unexpected schema table identifier");
    await transaction.$executeRaw(Prisma.sql`DELETE FROM ${Prisma.raw(`"${table}"`)}`);
  }
}
