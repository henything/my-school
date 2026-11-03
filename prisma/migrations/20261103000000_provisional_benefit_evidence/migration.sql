ALTER TYPE "TaskType" ADD VALUE 'BENEFIT_REVIEW_REQUIRED';

ALTER TABLE "parents"
  ADD COLUMN "benefit_evidence_id" UUID,
  ADD COLUMN "benefit_evidence_submitted_at" TIMESTAMP(3),
  ADD COLUMN "benefit_first_invoice_month" DATE,
  ADD COLUMN "benefit_provisional_category" "BenefitCategory";

CREATE TABLE "parent_benefit_evidence" (
  "id" UUID NOT NULL,
  "school_id" UUID NOT NULL,
  "parent_id" UUID NOT NULL,
  "category" "BenefitCategory" NOT NULL,
  "original_file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "file_size_bytes" INTEGER NOT NULL,
  "content" BYTEA NOT NULL,
  "uploaded_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "parent_benefit_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "parent_benefit_evidence_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "parent_benefit_evidence_school_id_parent_id_idx" ON "parent_benefit_evidence"("school_id", "parent_id");
CREATE UNIQUE INDEX "parents_benefit_evidence_id_key" ON "parents"("benefit_evidence_id");
ALTER TABLE "parents" ADD CONSTRAINT "parents_benefit_evidence_id_fkey" FOREIGN KEY ("benefit_evidence_id") REFERENCES "parent_benefit_evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
