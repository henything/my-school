UPDATE "parents"
SET "phone" = normalized."value"
FROM (
  SELECT
    "id",
    CASE
      WHEN length(digits) = 10 THEN '+7' || digits
      WHEN length(digits) = 11 AND left(digits, 1) = '8' THEN '+7' || right(digits, 10)
      WHEN length(digits) = 11 AND left(digits, 1) = '7' THEN '+' || digits
      ELSE "phone"
    END AS "value"
  FROM (
    SELECT "id", "phone", regexp_replace("phone", '\D', '', 'g') AS digits
    FROM "parents"
    WHERE "phone" IS NOT NULL AND btrim("phone") <> ''
  ) source
) normalized
WHERE "parents"."id" = normalized."id"
  AND "parents"."phone" <> normalized."value";

UPDATE "coach_profiles"
SET "phone" = normalized."value"
FROM (
  SELECT
    "id",
    CASE
      WHEN length(digits) = 10 THEN '+7' || digits
      WHEN length(digits) = 11 AND left(digits, 1) = '8' THEN '+7' || right(digits, 10)
      WHEN length(digits) = 11 AND left(digits, 1) = '7' THEN '+' || digits
      ELSE "phone"
    END AS "value"
  FROM (
    SELECT "id", "phone", regexp_replace("phone", '\D', '', 'g') AS digits
    FROM "coach_profiles"
    WHERE "phone" IS NOT NULL AND btrim("phone") <> ''
  ) source
) normalized
WHERE "coach_profiles"."id" = normalized."id"
  AND "coach_profiles"."phone" <> normalized."value";

UPDATE "trial_participants"
SET "parent_phone" = normalized."value"
FROM (
  SELECT
    "id",
    CASE
      WHEN length(digits) = 10 THEN '+7' || digits
      WHEN length(digits) = 11 AND left(digits, 1) = '8' THEN '+7' || right(digits, 10)
      WHEN length(digits) = 11 AND left(digits, 1) = '7' THEN '+' || digits
      ELSE "parent_phone"
    END AS "value"
  FROM (
    SELECT "id", "parent_phone", regexp_replace("parent_phone", '\D', '', 'g') AS digits
    FROM "trial_participants"
    WHERE "parent_phone" IS NOT NULL AND btrim("parent_phone") <> ''
  ) source
) normalized
WHERE "trial_participants"."id" = normalized."id"
  AND "trial_participants"."parent_phone" <> normalized."value";

UPDATE "users"
SET "login" = normalized."value"
FROM (
  SELECT
    "id",
    "school_id",
    CASE
      WHEN length(digits) = 10 THEN '+7' || digits
      WHEN length(digits) = 11 AND left(digits, 1) = '8' THEN '+7' || right(digits, 10)
      WHEN length(digits) = 11 AND left(digits, 1) = '7' THEN '+' || digits
      ELSE "login"
    END AS "value"
  FROM (
    SELECT "id", "school_id", "login", regexp_replace("login", '\D', '', 'g') AS digits
    FROM "users"
    WHERE "role" = 'PARENT'
      AND "login" IS NOT NULL
      AND btrim("login") <> ''
  ) source
) normalized
WHERE "users"."id" = normalized."id"
  AND "users"."login" <> normalized."value"
  AND NOT EXISTS (
    SELECT 1
    FROM "users" duplicate_user
    WHERE duplicate_user."school_id" = normalized."school_id"
      AND duplicate_user."login" = normalized."value"
      AND duplicate_user."id" <> "users"."id"
  );
