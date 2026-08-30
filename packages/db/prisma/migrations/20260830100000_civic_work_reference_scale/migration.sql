-- Preserve the readable three-digit minimum while allowing more than 999
-- civic works in one month without truncating or colliding references.
CREATE OR REPLACE FUNCTION next_civic_work_reference()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    current_period text;
    next_value integer;
    sequence_text text;
BEGIN
    current_period := to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'YYYYMM');
    INSERT INTO "CivicWorkReferenceCounter" ("period", "lastValue")
    VALUES (current_period, 1)
    ON CONFLICT ("period") DO UPDATE
    SET "lastValue" = "CivicWorkReferenceCounter"."lastValue" + 1
    RETURNING "lastValue" INTO next_value;

    sequence_text := next_value::text;
    RETURN 'CW' || current_period || lpad(sequence_text, GREATEST(3, length(sequence_text)), '0');
END;
$$;
