CREATE TYPE "BenefitCategory" AS ENUM ('LARGE_FAMILY', 'MILITARY_FAMILY', 'TWO_CHILDREN');
CREATE TYPE "BenefitStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');
ALTER TABLE "parents"
  ADD COLUMN "benefit_category" "BenefitCategory",
  ADD COLUMN "benefit_status" "BenefitStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "benefit_review_comment" TEXT,
  ADD COLUMN "benefit_reviewed_at" TIMESTAMP(3);
ALTER TABLE "subscriptions"
  ADD COLUMN "base_lesson_price_kopeks" INTEGER,
  ADD COLUMN "base_total_amount_kopeks" INTEGER,
  ADD COLUMN "discount_percent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discount_category" "BenefitCategory";
ALTER TABLE "invoices"
  ADD COLUMN "amount_before_discount_kopeks" INTEGER,
  ADD COLUMN "discount_amount_kopeks" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discount_percent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discount_category" "BenefitCategory";
