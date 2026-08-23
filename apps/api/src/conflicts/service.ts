import type { Prisma, PrismaClient } from "db";
import type { ProjectConflict } from "@civicos/shared";

export type ConflictCheckClient = Prisma.TransactionClient | PrismaClient;

// Part III §11 — Phase 6 wires this call at every timeline boundary. Phase 7
// replaces only this function body; advisory results must never block progress.
export async function checkProjectConflicts(
  client: ConflictCheckClient,
  projectId: string,
): Promise<ProjectConflict[]> {
  void client;
  void projectId;
  return [];
}
