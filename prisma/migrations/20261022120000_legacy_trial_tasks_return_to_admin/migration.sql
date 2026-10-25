UPDATE "tasks" AS task
SET "assignee_user_id" = (
      SELECT usr."id" FROM "users" AS usr
      WHERE usr."school_id" = task."school_id"
        AND usr."role" IN ('SUPER_ADMIN', 'ADMIN')
        AND usr."status" = 'ACTIVE'
      ORDER BY usr."created_at" ASC LIMIT 1
    ),
    "title" = 'Обработать пробника',
    "updated_at" = NOW()
FROM "trial_participants" AS trial
JOIN "trial_test_journeys" AS journey ON journey."trial_id" = trial."id"
WHERE task."related_entity_type" = 'TrialParticipant'
  AND task."related_entity_id" = trial."id"
  AND task."type" = 'TRIAL_NEEDS_PROCESSING'
  AND task."status" IN ('OPEN', 'IN_PROGRESS')
  AND trial."converted_child_id" IS NULL
  AND EXISTS (
    SELECT 1 FROM "users" AS usr
    WHERE usr."school_id" = task."school_id"
      AND usr."role" IN ('SUPER_ADMIN', 'ADMIN')
      AND usr."status" = 'ACTIVE'
  );
