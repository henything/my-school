-- CreateEnum
CREATE TYPE "TrialStatus" AS ENUM (
    'TRIAL_BOOKED',
    'TRIAL_ATTENDED',
    'TRIAL_NO_SHOW',
    'CONTACT_COLLECTED',
    'TRANSFERRED_TO_ADMIN',
    'CONVERTED_TO_ACTIVE'
);

-- CreateEnum
CREATE TYPE "TrialSource" AS ENUM (
    'VK',
    'REFERRAL',
    'KINDERGARTEN',
    'ADVERTISING',
    'OTHER',
    'UNKNOWN'
);

-- CreateTable
CREATE TABLE "trial_participants" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "coach_id" UUID NOT NULL,
    "converted_child_id" UUID,
    "child_name" TEXT,
    "child_age" INTEGER,
    "parent_name" TEXT,
    "parent_phone" TEXT,
    "parent_vk_url" TEXT,
    "source" "TrialSource" NOT NULL DEFAULT 'UNKNOWN',
    "status" "TrialStatus" NOT NULL DEFAULT 'TRIAL_BOOKED',
    "comment" TEXT,
    "created_by_user_id" UUID,
    "converted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trial_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trial_participants_school_id_idx" ON "trial_participants"("school_id");

-- CreateIndex
CREATE INDEX "trial_participants_lesson_id_idx" ON "trial_participants"("lesson_id");

-- CreateIndex
CREATE INDEX "trial_participants_group_id_idx" ON "trial_participants"("group_id");

-- CreateIndex
CREATE INDEX "trial_participants_coach_id_idx" ON "trial_participants"("coach_id");

-- CreateIndex
CREATE INDEX "trial_participants_status_idx" ON "trial_participants"("status");

-- CreateIndex
CREATE INDEX "trial_participants_converted_child_id_idx" ON "trial_participants"("converted_child_id");

-- CreateIndex
CREATE INDEX "trial_participants_created_by_user_id_idx" ON "trial_participants"("created_by_user_id");

-- CreateIndex
CREATE INDEX "trial_participants_school_id_status_idx" ON "trial_participants"("school_id", "status");

-- AddForeignKey
ALTER TABLE "trial_participants" ADD CONSTRAINT "trial_participants_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_participants" ADD CONSTRAINT "trial_participants_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_participants" ADD CONSTRAINT "trial_participants_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_participants" ADD CONSTRAINT "trial_participants_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coach_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_participants" ADD CONSTRAINT "trial_participants_converted_child_id_fkey" FOREIGN KEY ("converted_child_id") REFERENCES "children"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_participants" ADD CONSTRAINT "trial_participants_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
