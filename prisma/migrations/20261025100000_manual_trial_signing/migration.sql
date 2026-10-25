ALTER TABLE "trial_signing_packages" ADD COLUMN "method" TEXT NOT NULL DEFAULT 'FDOC';
ALTER TABLE "trial_signing_packages" ADD COLUMN "verified_by_user_id" UUID;
ALTER TABLE "trial_signing_packages" ADD COLUMN "verification_comment" TEXT;
