import type { Prisma } from "db";

// Part III §7.1: a configured boundary, including its edge, determines the ward.
export function resolveWardGeometry(client: Pick<Prisma.TransactionClient, "$queryRaw">, geometry: unknown) {
  return client.$queryRaw<Array<{ id: string; name: string }>>`
    SELECT "id", "name" FROM "Ward"
    WHERE ST_Covers("boundary", ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}),4326))
    ORDER BY "id" LIMIT 1
  `;
}
