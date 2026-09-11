-- Part III §7.1/§20: additive reference data, including populated deployments.
-- This is a demo reporting boundary, not an official municipal ward boundary.
INSERT INTO "Ward" ("id", "name", "boundary", "verificationRadiusOverrideMeters")
VALUES ('10000000-0000-4000-8000-000000000011', 'Jakkasandra / JAIN Global Campus',
  ST_GeomFromText('POLYGON((77.425 12.625,77.458 12.625,77.458 12.655,77.425 12.655,77.425 12.625))',4326), NULL)
ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "boundary" = EXCLUDED."boundary";

-- An explicitly illustrative campus access corridor for road-intelligence demos.
INSERT INTO "RoadSegment" ("id", "roadName", "geometry", "wardId", "surfaceType")
VALUES ('80000000-0000-4000-8000-000000000011', 'JAIN campus access road (demo segment)',
  ST_GeomFromText('LINESTRING(77.4395 12.63865,77.4435 12.63865)',4326),
  '10000000-0000-4000-8000-000000000011', 'Asphalt')
ON CONFLICT ("id") DO NOTHING;

-- This existing switch is already ignored by the production deployment profile.
UPDATE "SystemConfig" SET "value" = 'false'::jsonb WHERE "key" = 'demo.web_auto_route_enabled';
