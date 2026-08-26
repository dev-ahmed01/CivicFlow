ALTER TABLE "Ticket"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "TicketStateTransition"
ADD COLUMN "actedById" UUID;

CREATE INDEX "TicketStateTransition_actedById_idx"
ON "TicketStateTransition"("actedById");

ALTER TABLE "TicketStateTransition"
ADD CONSTRAINT "TicketStateTransition_actedById_fkey"
FOREIGN KEY ("actedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Ticket" ALTER COLUMN "updatedAt" DROP DEFAULT;
