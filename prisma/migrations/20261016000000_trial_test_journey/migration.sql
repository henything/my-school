CREATE TABLE "trial_test_journeys" (
  "id" UUID NOT NULL,
  "school_id" UUID NOT NULL,
  "trial_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "child_birth_date" DATE NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paid_at" TIMESTAMP(3),
  CONSTRAINT "trial_test_journeys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trial_test_journeys_trial_id_key" ON "trial_test_journeys"("trial_id");
CREATE UNIQUE INDEX "trial_test_journeys_token_hash_key" ON "trial_test_journeys"("token_hash");
CREATE INDEX "trial_test_journeys_school_id_idx" ON "trial_test_journeys"("school_id");

ALTER TABLE "trial_test_journeys"
  ADD CONSTRAINT "trial_test_journeys_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "trial_test_journeys"
  ADD CONSTRAINT "trial_test_journeys_trial_id_fkey"
  FOREIGN KEY ("trial_id") REFERENCES "trial_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
