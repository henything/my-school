CREATE TABLE "trial_enrollment_invites" (
  "id" UUID NOT NULL,
  "trial_id" UUID NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "claimed_parent_id" UUID,
  "claimed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "trial_enrollment_invites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "trial_enrollment_invites_trial_id_fkey" FOREIGN KEY ("trial_id") REFERENCES "trial_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trial_enrollment_invites_claimed_parent_id_fkey" FOREIGN KEY ("claimed_parent_id") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "trial_enrollment_invites_trial_id_key" ON "trial_enrollment_invites"("trial_id");
CREATE INDEX "trial_enrollment_invites_expires_at_claimed_at_idx" ON "trial_enrollment_invites"("expires_at", "claimed_at");
