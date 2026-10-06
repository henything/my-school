CREATE TABLE "child_attendance_plans" (
    "id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "weekday" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_attendance_plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "child_attendance_plans_weekday_check" CHECK ("weekday" IS NULL OR "weekday" BETWEEN 1 AND 7)
);

CREATE UNIQUE INDEX "child_attendance_plans_child_id_effective_from_key" ON "child_attendance_plans"("child_id", "effective_from");
CREATE INDEX "child_attendance_plans_child_id_effective_from_idx" ON "child_attendance_plans"("child_id", "effective_from");

ALTER TABLE "child_attendance_plans" ADD CONSTRAINT "child_attendance_plans_child_id_fkey"
FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;
