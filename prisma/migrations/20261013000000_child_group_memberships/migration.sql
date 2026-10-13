CREATE TABLE "child_group_memberships" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_group_memberships_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "child_group_memberships_date_check" CHECK ("end_date" IS NULL OR "end_date" >= "start_date")
);

CREATE INDEX "child_group_memberships_child_id_start_date_end_date_idx"
ON "child_group_memberships"("child_id", "start_date", "end_date");
CREATE INDEX "child_group_memberships_group_id_start_date_end_date_idx"
ON "child_group_memberships"("group_id", "start_date", "end_date");
CREATE UNIQUE INDEX "child_group_memberships_one_open_per_child_idx"
ON "child_group_memberships"("child_id") WHERE "end_date" IS NULL;

ALTER TABLE "child_group_memberships" ADD CONSTRAINT "child_group_memberships_child_id_fkey"
FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "child_group_memberships" ADD CONSTRAINT "child_group_memberships_group_id_fkey"
FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The last audited assignment is the best available start date for the current group.
-- Older assignments cannot be reconstructed reliably when no event or tabell exists.
INSERT INTO "child_group_memberships" ("id", "child_id", "group_id", "start_date")
SELECT gen_random_uuid(), child."id", child."current_group_id",
       COALESCE(
         (SELECT MAX(((audit."created_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow')::date)
          FROM "audit_logs" audit
          WHERE audit."entity_type" = 'Child'
            AND audit."entity_id" = child."id"::text
            AND audit."action" IN ('CHILD_TRANSFERRED', 'CHILD_ATTACHED_TO_GROUP')
            AND audit."new_value"->>'currentGroupId' = child."current_group_id"::text),
         ((child."created_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow')::date
       )
FROM "children" child
WHERE child."current_group_id" IS NOT NULL AND child."status" = 'ACTIVE';

-- Preserve every historical date that has a tabell, including departed children.
-- A one-day interval avoids inventing membership on dates with no evidence.
INSERT INTO "child_group_memberships" ("id", "child_id", "group_id", "start_date", "end_date")
SELECT gen_random_uuid(), history."child_id", history."group_id", history."lesson_date", history."lesson_date" + 1
FROM (
  SELECT DISTINCT record."child_id", lesson."group_id", lesson."lesson_date"
  FROM "attendance_records" record
  JOIN "lessons" lesson ON lesson."id" = record."lesson_id"
) history
WHERE NOT EXISTS (
  SELECT 1 FROM "child_group_memberships" membership
  WHERE membership."child_id" = history."child_id"
    AND membership."group_id" = history."group_id"
    AND membership."start_date" <= history."lesson_date"
    AND (membership."end_date" IS NULL OR history."lesson_date" < membership."end_date")
);
