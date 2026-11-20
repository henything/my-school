CREATE TYPE "SubscriptionPricingSource" AS ENUM ('BRANCH_TARIFF', 'DEFAULT', 'MANUAL');
CREATE TABLE "branch_tariffs" (
 "id" UUID NOT NULL, "school_id" UUID NOT NULL, "branch_id" UUID NOT NULL,
 "effective_month" DATE NOT NULL CHECK (EXTRACT(DAY FROM "effective_month") = 1),
 "lesson_price_kopeks" INTEGER NOT NULL CHECK ("lesson_price_kopeks" IN (45000,37500)),
 "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
 "created_by_user_id" UUID NOT NULL, "updated_by_user_id" UUID NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "branch_tariffs_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "branch_tariffs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "branch_tariffs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "branch_tariffs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "branch_tariffs_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "branch_tariffs_school_id_branch_id_effective_month_key" ON "branch_tariffs"("school_id","branch_id","effective_month");
ALTER TABLE "subscriptions" ADD COLUMN "pricing_source" "SubscriptionPricingSource",
 ADD COLUMN "pricing_branch_id" UUID, ADD COLUMN "branch_tariff_id" UUID, ADD COLUMN "branch_tariff_version" INTEGER;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_pricing_branch_id_fkey" FOREIGN KEY ("pricing_branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_branch_tariff_id_fkey" FOREIGN KEY ("branch_tariff_id") REFERENCES "branch_tariffs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
