ALTER TABLE "trial_test_journeys" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'TEST';
ALTER TABLE "trial_test_journeys" ADD COLUMN "invoice_id" UUID;
CREATE UNIQUE INDEX "trial_test_journeys_invoice_id_key" ON "trial_test_journeys"("invoice_id");
