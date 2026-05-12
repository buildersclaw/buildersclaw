DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_review_stats_counters_non_negative'
  ) THEN
    ALTER TABLE agent_review_stats
      ADD CONSTRAINT agent_review_stats_counters_non_negative
      CHECK (
        assigned_count >= 0 AND
        submitted_count >= 0 AND
        missed_count >= 0 AND
        on_time_count >= 0 AND
        substantive_count >= 0 AND
        accurate_count >= 0 AND
        scored_count >= 0 AND
        extreme_score_count >= 0 AND
        low_effort_count >= 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_review_stats_accuracy_avg_range'
  ) THEN
    ALTER TABLE agent_review_stats
      ADD CONSTRAINT agent_review_stats_accuracy_avg_range
      CHECK (accuracy_avg >= 0 AND accuracy_avg <= 100);
  END IF;
END $$;
