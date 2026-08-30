import { Prisma, type PrismaClient } from "db";
import { civicWorkGeometrySchema, type CivicWorkGeometry, type ListCivicWorksQuery } from "@civicos/shared";

export type CivicWorkClient = PrismaClient | Prisma.TransactionClient;

export const civicWorkInclude = {
  category: { include: { primaryAgency: { select: { id: true, name: true } } } },
  agency: { select: { id: true, name: true, type: true } },
  ward: { select: { id: true, name: true } },
  ownerProjectHead: { select: { id: true, email: true } },
  engineer: { select: { id: true, email: true } },
  ticket: { select: { id: true, referenceNumber: true, title: true } },
  intervention: {
    include: {
      segment: {
        select: {
          id: true,
          roadName: true,
          wardId: true,
          surfaceType: true,
          lastRestorationDate: true,
          ward: { select: { id: true, name: true } },
        },
      },
    },
  },
  evidence: {
    orderBy: { createdAt: "desc" as const },
    select: { id: true, kind: true, label: true, url: true, contentType: true, createdAt: true },
  },
  auditEvents: {
    orderBy: { createdAt: "desc" as const },
    take: 100,
    select: { id: true, action: true, actorId: true, metadata: true, createdAt: true },
  },
  _count: {
    select: {
      dependencies: true,
      conflictLogs: true,
      conflictingLogs: true,
      roadConflictLogs: true,
      conflictingRoadLogs: true,
    },
  },
} satisfies Prisma.ProjectInclude;

export type CivicWorkRecord = Prisma.ProjectGetPayload<{ include: typeof civicWorkInclude }>;

type GeometryRow = { id: string; geometry: string | null };

export async function readCivicWorkGeometries(
  client: CivicWorkClient,
  ids: string[],
): Promise<Map<string, CivicWorkGeometry>> {
  if (ids.length === 0) return new Map();
  const rows = await client.$queryRaw<GeometryRow[]>(Prisma.sql`
    SELECT "id", ST_AsGeoJSON("geometry") AS "geometry"
    FROM "Project"
    WHERE "id" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
  `);
  return new Map(rows.flatMap((row) => {
    if (!row.geometry) return [];
    const parsed = civicWorkGeometrySchema.safeParse(JSON.parse(row.geometry));
    return parsed.success ? [[row.id, parsed.data] as const] : [];
  }));
}

export async function writeCivicWorkGeometry(
  client: CivicWorkClient,
  projectId: string,
  geometry: CivicWorkGeometry,
): Promise<void> {
  const geoJson = JSON.stringify(geometry);
  await client.$executeRaw`
    UPDATE "Project"
    SET "geometry" = ST_SetSRID(ST_GeomFromGeoJSON(${geoJson}), 4326)
    WHERE "id" = ${projectId}::uuid
  `;
}

export async function copyRoadSegmentGeometry(
  client: CivicWorkClient,
  projectId: string,
  segmentId: string,
): Promise<void> {
  await client.$executeRaw`
    UPDATE "Project" AS project
    SET "geometry" = segment."geometry"
    FROM "RoadSegment" AS segment
    WHERE project."id" = ${projectId}::uuid
      AND segment."id" = ${segmentId}::uuid
  `;
}

export async function geometryIsCoveredByWard(
  client: CivicWorkClient,
  wardId: string,
  geometry: CivicWorkGeometry,
): Promise<boolean> {
  const geoJson = JSON.stringify(geometry);
  const rows = await client.$queryRaw<Array<{ valid: boolean }>>`
    SELECT ST_IsValid(candidate.geometry)
      AND NOT ST_IsEmpty(candidate.geometry)
      AND ST_Covers(ward."boundary", candidate.geometry) AS "valid"
    FROM "Ward" AS ward
    CROSS JOIN LATERAL (
      SELECT ST_SetSRID(ST_GeomFromGeoJSON(${geoJson}), 4326) AS geometry
    ) AS candidate
    WHERE ward."id" = ${wardId}::uuid
  `;
  return rows[0]?.valid === true;
}

export async function findCivicWork(
  client: CivicWorkClient,
  id: string,
  where: Prisma.ProjectWhereInput = {},
): Promise<CivicWorkRecord | null> {
  return client.project.findFirst({ where: { id, ...where }, include: civicWorkInclude });
}

async function idsWithinBounds(client: CivicWorkClient, query: ListCivicWorksQuery): Promise<string[] | null> {
  if (query.minLongitude === undefined || query.minLatitude === undefined || query.maxLongitude === undefined || query.maxLatitude === undefined) {
    return null;
  }
  const rows = await client.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Project"
    WHERE "geometry" IS NOT NULL
      AND ST_Intersects(
        "geometry",
        ST_MakeEnvelope(${query.minLongitude}, ${query.minLatitude}, ${query.maxLongitude}, ${query.maxLatitude}, 4326)
      )
  `;
  return rows.map(({ id }) => id);
}

export async function listCivicWorkRecords(
  client: CivicWorkClient,
  query: ListCivicWorksQuery,
  scope: Prisma.ProjectWhereInput,
): Promise<{ records: CivicWorkRecord[]; total: number }> {
  const boundedIds = await idsWithinBounds(client, query);
  const where: Prisma.ProjectWhereInput = {
    ...scope,
    ...(query.agencyId ? { agencyId: query.agencyId } : {}),
    ...(query.wardId ? { wardId: query.wardId } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.status ? { state: query.status } : {}),
    ...(query.origin ? { origin: query.origin } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.dateFrom || query.dateTo ? {
      plannedStart: query.dateTo ? { lte: new Date(query.dateTo) } : { not: null },
      plannedEnd: query.dateFrom ? { gte: new Date(query.dateFrom) } : { not: null },
    } : {}),
    ...(boundedIds ? { id: { in: boundedIds } } : {}),
  };
  const [records, total] = await Promise.all([
    client.project.findMany({
      where,
      include: civicWorkInclude,
      orderBy: [{ plannedStart: "asc" }, { createdAt: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    client.project.count({ where }),
  ]);
  return { records, total };
}
