CREATE TABLE "subscription_lessons" (
  "id" UUID NOT NULL PRIMARY KEY,
  "subscription_id" UUID NOT NULL REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "lesson_id" UUID NOT NULL REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "group_id" UUID NOT NULL REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "lesson_date" DATE NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "subscription_lessons_subscription_id_lesson_id_key" ON "subscription_lessons"("subscription_id", "lesson_id");
CREATE INDEX "subscription_lessons_group_id_lesson_date_idx" ON "subscription_lessons"("group_id", "lesson_date");

CREATE TABLE "billing_adjustments" (
  "id" UUID NOT NULL PRIMARY KEY,
  "school_id" UUID NOT NULL REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "child_id" UUID NOT NULL REFERENCES "children"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "parent_id" UUID NOT NULL REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "source_subscription_id" UUID REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "source_invoice_id" UUID REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "kind" TEXT NOT NULL,
  "amount_kopeks" INTEGER NOT NULL,
  "applied_amount_kopeks" INTEGER NOT NULL DEFAULT 0,
  "reason" TEXT NOT NULL,
  "created_by_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "refunded_at" TIMESTAMP(3),
  CONSTRAINT "billing_adjustments_positive_amount" CHECK ("amount_kopeks" > 0),
  CONSTRAINT "billing_adjustments_valid_applied" CHECK ("applied_amount_kopeks" >= 0 AND "applied_amount_kopeks" <= "amount_kopeks")
);
CREATE INDEX "billing_adjustments_school_id_child_id_kind_idx" ON "billing_adjustments"("school_id", "child_id", "kind");
CREATE INDEX "billing_adjustments_parent_id_idx" ON "billing_adjustments"("parent_id");

CREATE TABLE "billing_adjustment_applications" (
  "id" UUID NOT NULL PRIMARY KEY,
  "adjustment_id" UUID NOT NULL REFERENCES "billing_adjustments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "invoice_id" UUID NOT NULL REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "amount_kopeks" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_adjustment_application_positive" CHECK ("amount_kopeks" > 0)
);
CREATE UNIQUE INDEX "billing_adjustment_applications_adjustment_id_invoice_id_key" ON "billing_adjustment_applications"("adjustment_id", "invoice_id");
CREATE INDEX "billing_adjustment_applications_invoice_id_idx" ON "billing_adjustment_applications"("invoice_id");
