-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('SCHEDULED', 'ATTENDANCE_PENDING', 'ATTENDANCE_COMPLETED', 'MOVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LessonChangeReason" AS ENUM ('QUARANTINE', 'KINDERGARTEN_EVENT', 'RUSSIAN_HOLIDAY', 'COACH_UNAVAILABLE', 'GROUP_TRANSFER', 'OTHER');

-- CreateTable
CREATE TABLE "schedule_templates" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "coach_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "coach_id" UUID NOT NULL,
    "substitute_coach_id" UUID,
    "schedule_template_id" UUID,
    "lesson_date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "status" "LessonStatus" NOT NULL DEFAULT 'SCHEDULED',
    "change_reason" "LessonChangeReason",
    "change_comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_templates_school_id_idx" ON "schedule_templates"("school_id");

-- CreateIndex
CREATE INDEX "schedule_templates_group_id_idx" ON "schedule_templates"("group_id");

-- CreateIndex
CREATE INDEX "schedule_templates_branch_id_idx" ON "schedule_templates"("branch_id");

-- CreateIndex
CREATE INDEX "schedule_templates_coach_id_idx" ON "schedule_templates"("coach_id");

-- CreateIndex
CREATE INDEX "schedule_templates_status_idx" ON "schedule_templates"("status");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_templates_group_id_weekday_start_time_key" ON "schedule_templates"("group_id", "weekday", "start_time");

-- CreateIndex
CREATE INDEX "lessons_school_id_idx" ON "lessons"("school_id");

-- CreateIndex
CREATE INDEX "lessons_group_id_idx" ON "lessons"("group_id");

-- CreateIndex
CREATE INDEX "lessons_branch_id_idx" ON "lessons"("branch_id");

-- CreateIndex
CREATE INDEX "lessons_coach_id_idx" ON "lessons"("coach_id");

-- CreateIndex
CREATE INDEX "lessons_substitute_coach_id_idx" ON "lessons"("substitute_coach_id");

-- CreateIndex
CREATE INDEX "lessons_schedule_template_id_idx" ON "lessons"("schedule_template_id");

-- CreateIndex
CREATE INDEX "lessons_lesson_date_idx" ON "lessons"("lesson_date");

-- CreateIndex
CREATE INDEX "lessons_status_idx" ON "lessons"("status");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_group_id_lesson_date_start_time_key" ON "lessons"("group_id", "lesson_date", "start_time");

-- AddForeignKey
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coach_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coach_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_substitute_coach_id_fkey" FOREIGN KEY ("substitute_coach_id") REFERENCES "coach_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_schedule_template_id_fkey" FOREIGN KEY ("schedule_template_id") REFERENCES "schedule_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
