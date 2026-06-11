-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('NOT_INVOICED', 'INVOICED', 'NOT_PAID', 'PAID', 'PARTIALLY_PAID', 'OVERDUE');

-- AlterEnum
ALTER TYPE "BalanceTransactionType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_CREATED';
ALTER TYPE "BalanceTransactionType" ADD VALUE IF NOT EXISTS 'SICKNESS_MAKEUP_CREATED';
ALTER TYPE "BalanceTransactionType" ADD VALUE IF NOT EXISTS 'VACATION_MAKEUP_CREATED';
ALTER TYPE "BalanceTransactionType" ADD VALUE IF NOT EXISTS 'QUARANTINE_MAKEUP_CREATED';
ALTER TYPE "BalanceTransactionType" ADD VALUE IF NOT EXISTS 'EVENT_MAKEUP_CREATED';
ALTER TYPE "BalanceTransactionType" ADD VALUE IF NOT EXISTS 'CREDIT_LESSON_USED';
ALTER TYPE "BalanceTransactionType" ADD VALUE IF NOT EXISTS 'MAKEUP_USED';
ALTER TYPE "BalanceTransactionType" ADD VALUE IF NOT EXISTS 'MANUAL_ADJUSTMENT';

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "planned_lessons_count" INTEGER NOT NULL,
    "lesson_price_kopeks" INTEGER NOT NULL DEFAULT 45000,
    "total_amount_kopeks" INTEGER NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'NOT_INVOICED',
    "payment_status_changed_at" TIMESTAMP(3),
    "payment_status_comment" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "lesson_balance_transactions" ADD COLUMN "subscription_id" UUID;

-- CreateIndex
CREATE INDEX "subscriptions_school_id_idx" ON "subscriptions"("school_id");

-- CreateIndex
CREATE INDEX "subscriptions_child_id_idx" ON "subscriptions"("child_id");

-- CreateIndex
CREATE INDEX "subscriptions_created_by_user_id_idx" ON "subscriptions"("created_by_user_id");

-- CreateIndex
CREATE INDEX "subscriptions_payment_status_idx" ON "subscriptions"("payment_status");

-- CreateIndex
CREATE INDEX "subscriptions_period_start_period_end_idx" ON "subscriptions"("period_start", "period_end");

-- CreateIndex
CREATE INDEX "lesson_balance_transactions_subscription_id_idx" ON "lesson_balance_transactions"("subscription_id");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_balance_transactions" ADD CONSTRAINT "lesson_balance_transactions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
