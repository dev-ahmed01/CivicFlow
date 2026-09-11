import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { DEMO_WARD_SRID, demoWardBoundaryWkt, demoWardIds, demoWards } from "./demo-wards";

export interface ProvisionRoadScansResult {
  camerasProvisioned: number;
  wardId: string;
  wardName: string;
  agencyId: string;
  agencyName: string;
}

export async function provisionRoadScans(client?: PrismaClient): Promise<ProvisionRoadScansResult> {
  const prisma = client ?? new PrismaClient();
  const pwdAgencyId = "20000000-0000-4000-8000-000000000003";
  const roadCategoryId = "30000000-0000-4000-8000-000000000001";
  const jakkasandraWardId = demoWardIds.jakkasandra;
  const segmentId = "ac000000-0000-4000-8000-000000000001";

  // 1. Ensure PWD Agency exists
  const agency = await prisma.agency.upsert({
    where: { id: pwdAgencyId },
    update: { name: "BBMP Road Infrastructure", type: "Roads/PWD" },
    create: { id: pwdAgencyId, name: "BBMP Road Infrastructure", type: "Roads/PWD" },
  });

  // 2. Ensure Road Damage Category exists
  const category = await prisma.category.upsert({
    where: { id: roadCategoryId },
    update: { name: "Road Damage", primaryAgencyId: pwdAgencyId, isConfigurable: true },
    create: { id: roadCategoryId, name: "Road Damage", relevancePrompt: "a pothole, damaged road, cracked pavement, or broken asphalt", primaryAgencyId: pwdAgencyId, isConfigurable: true },
  });

  // 3. Ensure SystemConfig road.category_id is set
  await prisma.systemConfig.upsert({
    where: { key: "road.category_id" },
    update: { value: category.id, description: "System-configured category that enables Road-Cutting Intelligence" },
    create: { key: "road.category_id", value: category.id, description: "System-configured category that enables Road-Cutting Intelligence" },
  });

  // 4. Ensure Jakkasandra Ward exists
  const wardDef = demoWards.find(w => w.id === jakkasandraWardId) ?? demoWards[0]!;
  const boundary = demoWardBoundaryWkt(wardDef);
  await prisma.$executeRaw`
    INSERT INTO "Ward" ("id", "name", "boundary", "verificationRadiusOverrideMeters")
    VALUES (${wardDef.id}::uuid, ${wardDef.name}, ST_GeomFromText(${boundary}, ${DEMO_WARD_SRID}::integer), NULL)
    ON CONFLICT ("id") DO UPDATE SET
      "name" = EXCLUDED."name",
      "boundary" = EXCLUDED."boundary"
  `;

  // 5. Ensure RoadSegment exists
  await prisma.$executeRaw`
    INSERT INTO "RoadSegment" ("id", "roadName", "geometry", "wardId", "surfaceType")
    VALUES (${segmentId}::uuid, 'Jakkasandra demo camera coverage',
      ST_GeomFromText('LINESTRING(77.438 12.637,77.443 12.641)', 4326), ${wardDef.id}::uuid, 'Asphalt')
    ON CONFLICT ("id") DO NOTHING
  `;

  // 6. Locate and load manifest.json
  const manifestPaths = [
    resolve(process.cwd(), "packages/db/demo/road-scans/manifest.json"),
    resolve(process.cwd(), "demo/road-scans/manifest.json"),
    resolve(__dirname, "../demo/road-scans/manifest.json"),
    resolve(__dirname, "../../demo/road-scans/manifest.json"),
  ];
  const manifestPath = manifestPaths.find(path => existsSync(path));
  if (!manifestPath) {
    throw new Error(`Demo camera manifest not found. Checked: ${manifestPaths.join(", ")}`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    cameras: Array<{
      code: string;
      reference: string;
      name: string;
      latitude: number;
      longitude: number;
    }>;
  };

  // 7. Upsert camera rows with full, explicit update object (idempotent, safe)
  for (const [index, camera] of manifest.cameras.entries()) {
    const cameraId = `ac000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`;
    await prisma.roadCamera.upsert({
      where: { code: camera.code },
      update: {
        name: camera.name,
        wardId: wardDef.id,
        agencyId: pwdAgencyId,
        categoryId: roadCategoryId,
        roadSegmentId: segmentId,
        latitude: camera.latitude,
        longitude: camera.longitude,
        simulated: true,
        providerReference: camera.reference,
        enabled: true,
      },
      create: {
        id: cameraId,
        code: camera.code,
        name: camera.name,
        wardId: wardDef.id,
        agencyId: pwdAgencyId,
        categoryId: roadCategoryId,
        roadSegmentId: segmentId,
        latitude: camera.latitude,
        longitude: camera.longitude,
        simulated: true,
        providerReference: camera.reference,
        enabled: true,
      },
    });
  }

  return {
    camerasProvisioned: manifest.cameras.length,
    wardId: wardDef.id,
    wardName: wardDef.name,
    agencyId: agency.id,
    agencyName: agency.name,
  };
}
