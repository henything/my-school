-- CreateEnum
CREATE TYPE "MakeupReason" AS ENUM (
    'SICKNESS',
    'VACATION',
    'QUARANTINE',
    'KINDERGARTEN_EVENT',
    'RUSSIAN_HOLIDAY',
    'COACH_UNAVAILABLE',
    'GROUP_TRANSFER',
    'OTHER'
);

-- CreateEnum
CREATE TYPE "MakeupStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'USED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GroupEventActionType" AS ENUM ('MAKEUP_AND_CANCEL_LESSONS');

-- CreateTable
CREATE TABLE "group_events" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "reason" "LessonChangeReason" NOT NULL,
    "action_type" "GroupEventActionType" NOT NULL DEFAULT 'MAKEUP_AND_CANCEL_LESSONS',
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "makeup_credits" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "source_lesson_id" UUID,
    "source_attendance_record_id" UUID,
    "group_event_id" UUID,
    "reason" "MakeupReason" NOT NULL,
    "status" "MakeupStatus" NOT NULL DEFAULT 'AVAILABLE',
    "assigned_lesson_id" UUID,
    "assigned_date" DATE,
    "created_by_user_id" UUID,
    "comment" TEXT,
    "used_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "makeup_credits_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "lesson_balance_transactions" ADD COLUMN "makeup_credit_id" UUID;

-- CreateIndex
CREATE INDEX "group_events_school_id_idx" ON "group_events"("school_id");

-- CreateIndex
CREATE INDEX "group_events_group_id_idx" ON "group_events"("group_id");

-- CreateIndex
CREATE INDEX "group_events_reason_idx" ON "group_events"("reason");

-- CreateIndex
CREATE INDEX "group_events_period_start_period_end_idx" ON "group_events"("period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "makeup_credits_child_id_source_lesson_id_reason_key" ON "makeup_credits"("child_id", "source_lesson_id", "reason");

-- CreateIndex
CREATE UNIQUE INDEX "makeup_credits_child_id_source_attendance_record_id_reason_key" ON "makeup_credits"("child_id", "source_attendance_record_id", "reason");

-- CreateIndex
CREATE INDEX "makeup_credits_school_id_idx" ON "makeup_credits"("school_id");

-- CreateIndex
CREATE INDEX "makeup_credits_child_id_idx" ON "makeup_credits"("child_id");

-- CreateIndex
CREATE INDEX "makeup_credits_group_id_idx" ON "makeup_credits"("group_id");

-- CreateIndex
CREATE INDEX "makeup_credits_source_lesson_id_idx" ON "makeup_credits"("source_lesson_id");

-- CreateIndex
CREATE INDEX "makeup_credits_source_attendance_record_id_idx" ON "makeup_credits"("source_attendance_record_id");

-- CreateIndex
CREATE INDEX "makeup_credits_group_event_id_idx" ON "makeup_credits"("group_event_id");

-- CreateIndex
CREATE INDEX "makeup_credits_status_idx" ON "makeup_credits"("status");

-- CreateIndex
CREATE INDEX "makeup_credits_reason_idx" ON "makeup_credits"("reason");

-- CreateIndex
CREATE INDEX "makeup_credits_assigned_lesson_id_idx" ON "makeup_credits"("assigned_lesson_id");

-- CreateIndex
CREATE INDEX "lesson_balance_transactions_makeup_credit_id_idx" ON "lesson_balance_transactions"("makeup_credit_id");

-- AddForeignKey
ALTER TABLE "group_events" ADD CONSTRAINT "group_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_events" ADD CONSTRAINT "group_events_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_events" ADD CONSTRAINT "group_events_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "makeup_credits" ADD CONSTRAINT "makeup_credits_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "makeup_credits" ADD CONSTRAINT "makeup_credits_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "makeup_credits" ADD CONSTRAINT "makeup_credits_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "makeup_credits" ADD CONSTRAINT "makeup_credits_source_lesson_id_fkey" FOREIGN KEY ("source_lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "makeup_credits" ADD CONSTRAINT "makeup_credits_source_attendance_record_id_fkey" FOREIGN KEY ("source_attendance_record_id") REFERENCES "attendance_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "makeup_credits" ADD CONSTRAINT "makeup_credits_group_event_id_fkey" FOREIGN KEY ("group_event_id") REFERENCES "group_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "makeup_credits" ADD CONSTRAINT "makeup_credits_assigned_lesson_id_fkey" FOREIGN KEY ("assigned_lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "makeup_credits" ADD CONSTRAINT "makeup_credits_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_balance_transactions" ADD CONSTRAINT "lesson_balance_transactions_makeup_credit_id_fkey" FOREIGN KEY ("makeup_credit_id") REFERENCES "makeup_credits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
