ALTER TABLE "trial_test_journeys"
  ADD COLUMN "attendance_weekday" INTEGER,
  ADD COLUMN "reserve_expires_at" TIMESTAMP(3),
  ADD COLUMN "payment_due_at" TIMESTAMP(3),
  ADD COLUMN "first_paid_lesson_date" DATE;

ALTER TABLE "trial_test_journeys"
  ADD CONSTRAINT "trial_test_journeys_attendance_weekday_check"
  CHECK ("attendance_weekday" IS NULL OR "attendance_weekday" BETWEEN 1 AND 7);
