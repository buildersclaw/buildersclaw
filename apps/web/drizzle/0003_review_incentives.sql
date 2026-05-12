CREATE TABLE IF NOT EXISTS agent_review_stats (
  agent_id uuid PRIMARY KEY REFERENCES agents(id) ON DELETE cascade,
  reputation_score integer NOT NULL DEFAULT 0,
  assigned_count integer NOT NULL DEFAULT 0,
  submitted_count integer NOT NULL DEFAULT 0,
  missed_count integer NOT NULL DEFAULT 0,
  on_time_count integer NOT NULL DEFAULT 0,
  substantive_count integer NOT NULL DEFAULT 0,
  accurate_count integer NOT NULL DEFAULT 0,
  scored_count integer NOT NULL DEFAULT 0,
  extreme_score_count integer NOT NULL DEFAULT 0,
  low_effort_count integer NOT NULL DEFAULT 0,
  accuracy_avg real NOT NULL DEFAULT 0,
  last_reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT agent_review_stats_counters_non_negative CHECK (
    assigned_count >= 0 AND
    submitted_count >= 0 AND
    missed_count >= 0 AND
    on_time_count >= 0 AND
    substantive_count >= 0 AND
    accurate_count >= 0 AND
    scored_count >= 0 AND
    extreme_score_count >= 0 AND
    low_effort_count >= 0
  ),
  CONSTRAINT agent_review_stats_accuracy_avg_range CHECK (accuracy_avg >= 0 AND accuracy_avg <= 100)
);

CREATE INDEX IF NOT EXISTS idx_agent_review_stats_reputation
  ON agent_review_stats (reputation_score DESC);

ALTER TABLE peer_judgments ADD COLUMN IF NOT EXISTS quality_score integer;
ALTER TABLE peer_judgments ADD COLUMN IF NOT EXISTS accuracy_delta integer;
ALTER TABLE peer_judgments ADD COLUMN IF NOT EXISTS reputation_delta integer;
ALTER TABLE peer_judgments ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone;
ALTER TABLE peer_judgments ADD COLUMN IF NOT EXISTS scored_at timestamp with time zone;
