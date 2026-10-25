UPDATE "tasks" AS task
SET "assignee_user_id" = coach."user_id",
    "title" = 'Обратная связь после пробного: ' || COALESCE(trial."child_name", 'ребёнок'),
    "description" = 'Свяжитесь с родителем, запишите обратную связь и отметьте решение семьи.',
    "updated_at" = NOW()
FROM "trial_participants" AS trial
JOIN "trial_test_journeys" AS journey ON journey."trial_id" = trial."id"
JOIN "coach_profiles" AS coach ON coach."id" = trial."coach_id"
WHERE task."related_entity_type" = 'TrialParticipant'
  AND task."related_entity_id" = trial."id"
  AND task."type" = 'TRIAL_NEEDS_PROCESSING'
  AND task."status" IN ('OPEN', 'IN_PROGRESS')
  AND trial."status" IN ('TRIAL_ATTENDED', 'CONTACT_COLLECTED')
  AND trial."trial_attended" = TRUE;
