-- CreateEnum
CREATE TYPE "CoachAttendanceStatus" AS ENUM ('NOT_MARKED', 'PRESENT', 'ABSENT_UNEXCUSED', 'ABSENT_SICK_PENDING');

-- CreateEnum
CREATE TYPE "AdminFinalAttendanceStatus" AS ENUM ('ABSENT_SICK_CONFIRMED', 'ABSENT_VACATION_APPROVED', 'ABSENT_QUARANTINE', 'ABSENT_EVENT', 'ABSENT_UNEXCUSED_FINAL');

-- CreateEnum
CREATE TYPE "BalanceType" AS ENUM ('LESSON_BALANCE', 'MAKEUP_BALANCE');

-- CreateEnum
CREATE TYPE "BalanceTransactionType" AS ENUM ('PRESENT_DEDUCTION', 'UNEXCUSED_ABSENCE_DEDUCTION', 'ATTENDANCE_DEDUCTION_REVERSAL');

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "status" "CoachAttendanceStatus" NOT NULL DEFAULT 'NOT_MARKED',
    "final_status" "AdminFinalAttendanceStatus",
    "marked_by_user_id" UUID,
    "marked_at" TIMESTAMP(3),
    "finalized_by_user_id" UUID,
    "finalized_at" TIMESTAMP(3),
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_balance_transactions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "lesson_id" UUID,
    "attendance_record_id" UUID,
    "type" "BalanceTransactionType" NOT NULL,
    "balance_type" "BalanceType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT,
    "created_by_user_id" UUID,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_balance_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_records_lesson_id_idx" ON "attendance_records"("lesson_id");

-- CreateIndex
CREATE INDEX "attendance_records_child_id_idx" ON "attendance_records"("child_id");

-- CreateIndex
CREATE INDEX "attendance_records_status_idx" ON "attendance_records"("status");

-- CreateIndex
CREATE INDEX "attendance_records_final_status_idx" ON "attendance_records"("final_status");

-- CreateIndex
CREATE INDEX "attendance_records_marked_by_user_id_idx" ON "attendance_records"("marked_by_user_id");

-- CreateIndex
CREATE INDEX "attendance_records_finalized_by_user_id_idx" ON "attendance_records"("finalized_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_lesson_id_child_id_key" ON "attendance_records"("lesson_id", "child_id");

-- CreateIndex
CREATE INDEX "lesson_balance_transactions_school_id_idx" ON "lesson_balance_transactions"("school_id");

-- CreateIndex
CREATE INDEX "lesson_balance_transactions_child_id_idx" ON "lesson_balance_transactions"("child_id");

-- CreateIndex
CREATE INDEX "lesson_balance_transactions_lesson_id_idx" ON "lesson_balance_transactions"("lesson_id");

-- CreateIndex
CREATE INDEX "lesson_balance_transactions_attendance_record_id_idx" ON "lesson_balance_transactions"("attendance_record_id");

-- CreateIndex
CREATE INDEX "lesson_balance_transactions_type_idx" ON "lesson_balance_transactions"("type");

-- CreateIndex
CREATE INDEX "lesson_balance_transactions_balance_type_idx" ON "lesson_balance_transactions"("balance_type");

-- CreateIndex
CREATE INDEX "lesson_balance_transactions_created_at_idx" ON "lesson_balance_transactions"("created_at");

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_marked_by_user_id_fkey" FOREIGN KEY ("marked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_finalized_by_user_id_fkey" FOREIGN KEY ("finalized_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_balance_transactions" ADD CONSTRAINT "lesson_balance_transactions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_balance_transactions" ADD CONSTRAINT "lesson_balance_transactions_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_balance_transactions" ADD CONSTRAINT "lesson_balance_transactions_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_balance_transactions" ADD CONSTRAINT "lesson_balance_transactions_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_balance_transactions" ADD CONSTRAINT "lesson_balance_transactions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
