-- Public ticket numbers use Bengaluru local time and an atomic monthly counter.
CREATE TABLE "TicketReferenceCounter" (
    "period" VARCHAR(6) NOT NULL,
    "lastValue" INTEGER NOT NULL,
    CONSTRAINT "TicketReferenceCounter_pkey" PRIMARY KEY ("period")
);

ALTER TABLE "Ticket" ADD COLUMN "referenceNumber" VARCHAR(20);

WITH numbered AS (
    SELECT "id",
           to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYYMM') AS period,
           row_number() OVER (
               PARTITION BY to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYYMM')
               ORDER BY "createdAt", "id"
           ) AS sequence
    FROM "Ticket"
)
UPDATE "Ticket" AS ticket
SET "referenceNumber" = numbered.period || lpad(numbered.sequence::text, 3, '0')
FROM numbered
WHERE ticket."id" = numbered."id";

INSERT INTO "TicketReferenceCounter" ("period", "lastValue")
SELECT substring("referenceNumber" FROM 1 FOR 6), MAX(substring("referenceNumber" FROM 7)::integer)
FROM "Ticket"
GROUP BY substring("referenceNumber" FROM 1 FOR 6);

CREATE OR REPLACE FUNCTION next_ticket_reference()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    current_period text;
    next_value integer;
BEGIN
    current_period := to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'YYYYMM');
    INSERT INTO "TicketReferenceCounter" ("period", "lastValue")
    VALUES (current_period, 1)
    ON CONFLICT ("period") DO UPDATE
    SET "lastValue" = "TicketReferenceCounter"."lastValue" + 1
    RETURNING "lastValue" INTO next_value;

    RETURN current_period || lpad(next_value::text, 3, '0');
END;
$$;

ALTER TABLE "Ticket" ALTER COLUMN "referenceNumber" SET NOT NULL;
ALTER TABLE "Ticket" ALTER COLUMN "referenceNumber" SET DEFAULT next_ticket_reference();
CREATE UNIQUE INDEX "Ticket_referenceNumber_key" ON "Ticket"("referenceNumber");
