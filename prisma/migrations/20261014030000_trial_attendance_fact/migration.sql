ALTER TABLE "trial_participants" ADD COLUMN "trial_attended" BOOLEAN;
UPDATE "trial_participants" SET "trial_attended" = TRUE WHERE "status" = 'TRIAL_ATTENDED';
UPDATE "trial_participants" SET "trial_attended" = FALSE WHERE "status" = 'TRIAL_NO_SHOW';
