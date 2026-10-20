CREATE TYPE "TrialSigningStatus" AS ENUM ('PENDING', 'SENT', 'WAITING', 'SIGNED', 'DECLINED', 'EXPIRED', 'ERROR');

CREATE TABLE "trial_signing_packages" (
  "id" UUID NOT NULL,
  "school_id" UUID NOT NULL,
  "trial_id" UUID NOT NULL,
  "status" "TrialSigningStatus" NOT NULL DEFAULT 'PENDING',
  "contract_document_id" TEXT,
  "consent_document_id" TEXT,
  "contract_status" TEXT,
  "consent_status" TEXT,
  "error_message" TEXT,
  "sent_at" TIMESTAMP(3),
  "signed_at" TIMESTAMP(3),
  "checked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "trial_signing_packages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trial_signing_packages_trial_id_key" ON "trial_signing_packages"("trial_id");
CREATE INDEX "trial_signing_packages_school_id_status_idx" ON "trial_signing_packages"("school_id", "status");
ALTER TABLE "trial_signing_packages" ADD CONSTRAINT "trial_signing_packages_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trial_signing_packages" ADD CONSTRAINT "trial_signing_packages_trial_id_fkey" FOREIGN KEY ("trial_id") REFERENCES "trial_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
