ALTER TABLE "schedule_templates" ADD COLUMN "valid_from" DATE, ADD COLUMN "valid_until" DATE;
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_valid_period"
  CHECK ("valid_from" IS NULL OR "valid_until" IS NULL OR "valid_from" < "valid_until");
DROP INDEX "schedule_templates_group_id_weekday_start_time_key";
CREATE INDEX "schedule_templates_group_id_weekday_start_time_idx" ON "schedule_templates"("group_id", "weekday", "start_time");
