import assert from "node:assert/strict";
import { Prisma, PrismaClient } from "@prisma/client";
import { DEMO_WARD_SRID, demoWards } from "../src/demo-wards";

process.env.DATABASE_URL ??= "postgresql://civicos:civicos@localhost:5433/civicos?schema=public";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  for (const expected of demoWards) {
    const matches = await prisma.$queryRaw<Array<{ id: string; name: string; srid: number }>>`
      SELECT "id", "name", ST_SRID("boundary") AS "srid"
      FROM "Ward"
      WHERE ST_Covers(
        "boundary",
        ST_SetSRID(
          ST_MakePoint(${expected.representativeCoordinates.longitude}, ${expected.representativeCoordinates.latitude}),
          ${DEMO_WARD_SRID}::integer
        )
      )
      ORDER BY "name"
    `;
    assert.deepEqual(matches, [{ id: expected.id, name: expected.name, srid: DEMO_WARD_SRID }]);
  }

  const overlaps = await prisma.$queryRaw<Array<{ leftName: string; rightName: string }>>`
    SELECT left_ward."name" AS "leftName", right_ward."name" AS "rightName"
    FROM "Ward" left_ward
    JOIN "Ward" right_ward ON left_ward."id" < right_ward."id"
    WHERE left_ward."id"::text IN (${Prisma.join(demoWards.map((ward) => ward.id))})
      AND right_ward."id"::text IN (${Prisma.join(demoWards.map((ward) => ward.id))})
      AND ST_Relate(left_ward."boundary", right_ward."boundary", 'T********')
  `;
  assert.deepEqual(overlaps, []);

  console.log(`Verified ${demoWards.length} SRID ${DEMO_WARD_SRID} demo wards with ST_Covers, including BTM Layout.`);
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
