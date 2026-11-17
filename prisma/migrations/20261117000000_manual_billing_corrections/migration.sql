-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "manual_adjustment_kopeks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "manual_basis_kopeks" INTEGER;

-- CreateTable
CREATE TABLE "billing_correction_operations" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "invoice_id" UUID,
    "operation_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "previous_value" INTEGER NOT NULL,
    "next_value" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "reversed_operation_id" UUID,
    "source_transaction_id" UUID,
    "balance_transaction_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_correction_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_correction_operations_reversed_operation_id_key" ON "billing_correction_operations"("reversed_operation_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_correction_operations_source_transaction_id_key" ON "billing_correction_operations"("source_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_correction_operations_balance_transaction_id_key" ON "billing_correction_operations"("balance_transaction_id");

-- CreateIndex
CREATE INDEX "billing_correction_operations_child_id_created_at_idx" ON "billing_correction_operations"("child_id", "created_at");

-- CreateIndex
CREATE INDEX "billing_correction_operations_invoice_id_created_at_idx" ON "billing_correction_operations"("invoice_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "billing_correction_operations_school_id_operation_id_key" ON "billing_correction_operations"("school_id", "operation_id");

-- AddForeignKey
ALTER TABLE "billing_correction_operations" ADD CONSTRAINT "billing_correction_operations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_correction_operations" ADD CONSTRAINT "billing_correction_operations_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_correction_operations" ADD CONSTRAINT "billing_correction_operations_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_correction_operations" ADD CONSTRAINT "billing_correction_operations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_correction_operations" ADD CONSTRAINT "billing_correction_operations_reversed_operation_id_fkey" FOREIGN KEY ("reversed_operation_id") REFERENCES "billing_correction_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_correction_operations" ADD CONSTRAINT "billing_correction_operations_source_transaction_id_fkey" FOREIGN KEY ("source_transaction_id") REFERENCES "lesson_balance_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_correction_operations" ADD CONSTRAINT "billing_correction_operations_balance_transaction_id_fkey" FOREIGN KEY ("balance_transaction_id") REFERENCES "lesson_balance_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
