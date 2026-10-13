ALTER TABLE "subscriptions" ADD COLUMN "group_id" UUID;

UPDATE "subscriptions" AS subscription
SET "group_id" = (
  SELECT "group_id"
  FROM "child_group_memberships" AS candidate
  WHERE candidate."child_id" = subscription."child_id"
    AND candidate."start_date" <= subscription."period_end"
    AND (candidate."end_date" IS NULL OR candidate."end_date" > subscription."period_start")
  ORDER BY candidate."start_date" ASC, candidate."created_at" ASC
  LIMIT 1
);

CREATE INDEX "subscriptions_group_id_idx" ON "subscriptions"("group_id");
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
