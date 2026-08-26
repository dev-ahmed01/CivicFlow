CREATE TYPE "Channel" AS ENUM ('WEB', 'MOBILE');

ALTER TABLE "Ticket"
ADD COLUMN "channel" "Channel" NOT NULL DEFAULT 'MOBILE';

INSERT INTO "AdminConfig" ("key", "value", "description")
VALUES (
  'demo.web_auto_route_enabled',
  'true'::jsonb,
  'Demo-only: route relevant web reports directly to the category''s configured primary agency'
)
ON CONFLICT ("key") DO NOTHING;
